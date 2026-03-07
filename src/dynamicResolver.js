/**
 * dynamicResolver.js
 * Resolves current person-tied handles (CM, PM) via CivicTag backend.
 * Results cached 24h in chrome.storage.local.
 */

const DynamicResolver = {

  _backendUrl() {
    return typeof CIVICTAG_CONFIG !== 'undefined' ? CIVICTAG_CONFIG.BACKEND_URL : 'https://civictag-api.vercel.app';
  },

  _cacheKey(roleKey, stateName) {
    return `dynhandle_${roleKey}_${(stateName || '').toLowerCase().replace(/\s+/g, '_')}`;
  },

  async readCache(key) {
    try {
      const data = await safeStorageGet([key]);
      const entry = data[key];
      if (entry && Date.now() < entry.expiresAt) return entry;
    } catch {}
    return null;
  },

  async writeCache(key, payload) {
    try {
      await safeStorageSet({
        [key]: { ...payload, cachedAt: Date.now(), expiresAt: Date.now() + 86400000 }
      });
    } catch {}
  },

  async lookupRoleHandle(roleKey, stateName, staticEntry) {
    const key = this._cacheKey(roleKey, stateName);
    const cached = await this.readCache(key);
    if (cached) {
      return { handle: cached.handle, name: cached.name, confidence: cached.confidence, isDynamic: true, isStale: false };
    }

    try {
      const res = await fetch(`${this._backendUrl()}/api/resolve-handle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CivicTag-Client': '1' },
        body: JSON.stringify({
          roleKey,
          stateName,
          fallbackHandle: staticEntry?.handle || null
        })
      });

      if (!res.ok) throw new Error(`Backend ${res.status}`);

      const data = await res.json();

      if (data.isDynamic && data.handle) {
        await this.writeCache(key, { handle: data.handle, name: data.name, confidence: data.confidence });
        return { handle: data.handle, name: data.name, confidence: data.confidence, isDynamic: true, isStale: false };
      }

      // Stale fallback
      const fallbackHandle = staticEntry?.handle;
      const fallbackName   = staticEntry?.name || roleKey;
      if (fallbackHandle) {
        return { handle: fallbackHandle, name: fallbackName, confidence: 0, isDynamic: false, isStale: true };
      }
      return null;
    } catch (err) {
      console.warn('CivicTag: DynamicResolver backend call failed', err);
      const fallbackHandle = staticEntry?.handle;
      if (fallbackHandle) {
        return { handle: fallbackHandle, name: staticEntry?.name || roleKey, confidence: 0, isDynamic: false, isStale: true };
      }
      return null;
    }
  },

  async forceRefresh(roleKey, stateName) {
    const key = this._cacheKey(roleKey, stateName);
    try { await safeStorageSet({ [key]: null }); } catch {}
    return this.lookupRoleHandle(roleKey, stateName, null);
  }
};

if (typeof module !== 'undefined' && module.exports) module.exports = DynamicResolver;
