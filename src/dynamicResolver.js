/**
 * dynamicResolver.js
 * Dynamically resolves person-tied authority handles (CM, PM, etc.) using Groq AI.
 * Falls back to the static database if Groq is unavailable.
 *
 * Cache: chrome.storage.local, key pattern: `dynhandle_<roleKey>_<stateSlug>`
 * TTL: 24 hours
 */

const DynamicResolver = (() => {
  const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
  const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

  /**
   * Build a storage key for caching
   */
  function cacheKey(roleKey, stateName) {
    const slug = (stateName || 'central').toLowerCase().replace(/[^a-z0-9]/g, '_');
    return `dynhandle_${roleKey}_${slug}`;
  }

  /**
   * Read cached entry. Returns null if absent or expired.
   */
  async function readCache(key) {
    try {
      const result = await safeStorageGet([key]);
      const entry = result[key];
      if (!entry) return null;
      if (Date.now() > entry.expiresAt) {
        // Expired — delete it silently
        safeStorageSet({ [key]: null });
        return null;
      }
      return entry;
    } catch {
      return null;
    }
  }

  /**
   * Write an entry to the cache.
   */
  async function writeCache(key, handle, name, confidence) {
    try {
      await safeStorageSet({
        [key]: {
          handle,
          name,
          confidence,
          cachedAt: Date.now(),
          expiresAt: Date.now() + CACHE_TTL_MS
        }
      });
    } catch {
      // Non-fatal — continue without caching
    }
  }

  /**
   * Ask Groq who currently holds a given role and return their X/Twitter handle.
   * @param {string} roleKey  - e.g. "cm", "pm_personal", "commissioner"
   * @param {string} stateName - e.g. "Karnataka", "Central Government"
   * @param {string} apiKey   - Groq API key
   * @returns {Promise<{handle:string, name:string, confidence:number}|null>}
   */
  async function queryGroq(roleKey, stateName, apiKey) {
    const roleDescriptions = {
      cm: `Chief Minister of ${stateName}`,
      pm_personal: 'Prime Minister of India',
      commissioner: `Municipal Commissioner`,
      deputy_cm: `Deputy Chief Minister of ${stateName}`,
      governor: `Governor of ${stateName}`,
    };

    const roleDescription = roleDescriptions[roleKey] || roleKey;

    const systemPrompt = `You are a real-time Indian politics expert. Your task is to identify the current ${roleDescription} and their official Twitter/X handle.

Return ONLY a valid JSON object with no explanation, no markdown, no backticks:
{
  "name": "Full name of the person",
  "handle": "@theirtwitter",
  "confidence": 0-100
}

Rules:
- Only return handles you are HIGHLY confident about (confidence >= 80).
- If unsure about the handle, set confidence to 0 and handle to null.
- The handle must start with "@".
- Base your answer on your most recent training data.`;

    const response = await fetch(GROQ_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Who is the current ${roleDescription}? What is their Twitter/X handle?` }
        ],
        temperature: 0,
        max_tokens: 120
      })
    });

    if (!response.ok) throw new Error(`Groq ${response.status}`);

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content?.trim();
    if (!text) return null;

    const parsed = extractJSON(text);
    if (!parsed) return null;

    // Reject low-confidence or malformed results
    if (!parsed.handle || !parsed.handle.startsWith('@')) return null;
    if ((parsed.confidence || 0) < 80) return null;

    return {
      handle: parsed.handle,
      name: parsed.name || roleDescription,
      confidence: parsed.confidence
    };
  }

  /**
   * Robust JSON extraction (same pattern as classifier.js)
   */
  function extractJSON(text) {
    try { return JSON.parse(text); } catch {}
    const m = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/```\s*([\s\S]*?)\s*```/);
    if (m?.[1]) { try { return JSON.parse(m[1].trim()); } catch {} }
    const first = text.indexOf('{');
    const last = text.lastIndexOf('}');
    if (first !== -1 && last !== -1) { try { return JSON.parse(text.substring(first, last + 1)); } catch {} }
    return null;
  }

  /**
   * Main public API.
   *
   * Given a role (e.g. "cm") and a state name (e.g. "Karnataka"), returns the
   * best available Twitter handle.
   *
   * @param {string} roleKey
   * @param {string} stateName
   * @param {object} [staticFallback] - The static DB entry { handle, name }
   * @returns {Promise<{handle, name, isDynamic, isStale, confidence, cachedAt}|null>}
   */
  async function lookupRoleHandle(roleKey, stateName, staticFallback = null) {
    const key = cacheKey(roleKey, stateName);

    // 1. Try from cache first
    const cached = await readCache(key);
    if (cached) {
      return {
        handle: cached.handle,
        name: cached.name,
        isDynamic: true,
        isStale: false,
        confidence: cached.confidence,
        cachedAt: cached.cachedAt
      };
    }

    // 2. Try live Groq lookup
    try {
      const groqResult = await safeStorageGet(['groqApiKey']);
      const apiKey = groqResult.groqApiKey;

      if (apiKey) {
        const result = await queryGroq(roleKey, stateName, apiKey);
        if (result) {
          await writeCache(key, result.handle, result.name, result.confidence);
          return {
            handle: result.handle,
            name: result.name,
            isDynamic: true,
            isStale: false,
            confidence: result.confidence,
            cachedAt: Date.now()
          };
        }
      }
    } catch (err) {
      console.warn(`CivicTag DynamicResolver: Groq lookup failed for ${roleKey}/${stateName}`, err);
    }

    // 3. Fall back to static DB entry
    if (staticFallback?.handle) {
      return {
        handle: staticFallback.handle,
        name: staticFallback.name || roleKey,
        isDynamic: false,
        isStale: true,   // Flag: may be outdated
        confidence: null,
        cachedAt: null
      };
    }

    return null;
  }

  /**
   * Force a fresh lookup (ignore cache) and update it.
   * Called when the user clicks the Refresh button on a dynamic handle.
   */
  async function forceRefresh(roleKey, stateName) {
    const key = cacheKey(roleKey, stateName);
    // Invalidate cache
    try { await safeStorageSet({ [key]: null }); } catch {}
    // Re-run with no static fallback (we want fresh or nothing)
    return lookupRoleHandle(roleKey, stateName, null);
  }

  // Public API
  return { lookupRoleHandle, forceRefresh };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = DynamicResolver;
}
