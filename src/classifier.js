/**
 * classifier.js
 * Handles complaint detection and classification via the CivicTag Backend API.
 * Falls back to keyword matching if the backend is unavailable.
 */

class ComplaintClassifier {
  constructor() {
    this.cache = new Map();
    this.cacheExpiry = 300000; // 5 minutes
    this.debounceTimer = null;
    this.debounceDelay = 1500;

    // Backend URL from config.js (loaded before this script)
    this.backendUrl = (typeof CIVICTAG_CONFIG !== 'undefined'
      ? CIVICTAG_CONFIG.BACKEND_URL
      : 'https://civictag-api.vercel.app');
  }

  async initialize() {
    // No API key needed — backend handles auth
    return true;
  }

  /**
   * Main classification function with debouncing
   * @param {string} tweetText - The tweet content to classify
   * @returns {Promise<Object>} Classification result
   */
  async classify(tweetText) {
    if (!tweetText || tweetText.trim().length === 0) return null;

    if (this.debounceTimer) clearTimeout(this.debounceTimer);

    return new Promise((resolve) => {
      this.debounceTimer = setTimeout(async () => {
        const cacheKey = this.getCacheKey(tweetText);
        const cached = this.getFromCache(cacheKey);
        if (cached) {
          console.log('CivicTag: Using cached classification');
          resolve(cached);
          return;
        }

        let result;
        try {
          result = await this.classifyWithBackend(tweetText);
        } catch (error) {
          console.error('CivicTag: Backend classify failed, using keyword fallback', error);
          result = this.classifyWithKeywords(tweetText);
        }

        if (result && result.isComplaint) this.saveToCache(cacheKey, result);
        resolve(result);
      }, this.debounceDelay);
    });
  }

  /**
   * Classify using the CivicTag backend (which calls Groq server-side)
   */
  async classifyWithBackend(tweetText) {
    const response = await fetch(`${this.backendUrl}/api/classify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CivicTag-Client': '1' },
      body: JSON.stringify({ tweetText: tweetText.trim() })
    });

    if (!response.ok) {
      const err = await response.text().catch(() => response.statusText);
      throw new Error(`Backend error: ${response.status} — ${err}`);
    }

    const data = await response.json();

    // Backend already enforces confidence threshold
    return data;
  }

  /**
   * Robust JSON extraction from LLM response (used by other modules that share this class)
   */
  extractAndParseJSON(text) {
    if (!text) return null;
    try { return JSON.parse(text); } catch (e) {}
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) ||
                      text.match(/```\s*([\s\S]*?)\s*```/);
    if (jsonMatch && jsonMatch[1]) {
      try { return JSON.parse(jsonMatch[1].trim()); } catch (e2) {}
    }
    const firstBrace = text.indexOf('{');
    const lastBrace  = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
      try { return JSON.parse(text.substring(firstBrace, lastBrace + 1)); } catch (e3) {}
    }
    return null;
  }

  /**
   * Fallback keyword-based classification (used when backend is unreachable)
   */
  classifyWithKeywords(tweetText) {
    const text = tweetText.toLowerCase();
    const complaintKeywords = [
      'no water','paani nahi','water supply','pothole','garbage','electricity','power cut',
      'sewage','drainage','broken','repair','complaint','please fix','pathetic','worst',
      'illegal','encroachment','corruption','bribe','stray dog','fire','traffic','noise',
      'pollution','bijli nahi','sadak','kachra','shikayat','खराब','पानी','बिजली','सड़क',
    ];
    const isComplaint = complaintKeywords.some(k => text.includes(k));
    if (!isComplaint) return { isComplaint: false, confidence: 30 };

    let department = 'General';
    if (text.includes('water') || text.includes('paani')) department = 'Water Supply';
    else if (text.includes('pothole') || text.includes('road')) department = 'Roads & Potholes';
    else if (text.includes('electric') || text.includes('power')) department = 'Electricity';
    else if (text.includes('garbage') || text.includes('waste')) department = 'Sanitation';
    else if (text.includes('traffic')) department = 'Traffic Management';
    else if (text.includes('corrupt') || text.includes('bribe')) department = 'Corruption';
    else if (text.includes('crime') || text.includes('police')) department = 'Crime';

    return {
      isComplaint: true,
      confidence: 70,
      department,
      urgency: (text.includes('urgent') || text.includes('emergency')) ? 'high' : 'medium',
      locationMentioned: null,
      language: /[\u0900-\u097F]/.test(tweetText) ? 'hindi' : 'english',
      reasoning: 'Keyword-based classification (offline fallback)'
    };
  }

  getCacheKey(text) { return text.trim().substring(0, 150); }

  getFromCache(key) {
    const cached = this.cache.get(key);
    if (cached && (Date.now() - cached.timestamp) < this.cacheExpiry) return cached.data;
    this.cache.delete(key);
    return null;
  }

  saveToCache(key, data) {
    this.cache.set(key, { data, timestamp: Date.now() });
    if (this.cache.size > 100) this.cache.delete(this.cache.keys().next().value);
  }
}

if (typeof module !== 'undefined' && module.exports) module.exports = ComplaintClassifier;
