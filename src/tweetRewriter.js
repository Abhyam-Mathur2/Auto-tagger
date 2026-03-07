/**
 * tweetRewriter.js
 * AI-powered tweet improvement — calls the CivicTag backend.
 * No Groq API key required from the user.
 */

const TweetRewriter = {

  SUPPORTED_LANGUAGES: [
    { key: 'auto',       label: '🔄 Same as original',   promptName: 'auto' },
    { key: 'english',    label: '🇬🇧 English',            promptName: 'English' },
    { key: 'hindi',      label: '🇮🇳 हिंदी (Hindi)',       promptName: 'Hindi' },
    { key: 'hinglish',   label: '🇮🇳 Hinglish',           promptName: 'Hinglish' },
    { key: 'tamil',      label: '🇮🇳 தமிழ் (Tamil)',       promptName: 'Tamil' },
    { key: 'telugu',     label: '🇮🇳 తెలుగు (Telugu)',     promptName: 'Telugu' },
    { key: 'kannada',    label: '🇮🇳 ಕನ್ನಡ (Kannada)',     promptName: 'Kannada' },
    { key: 'malayalam',  label: '🇮🇳 മലയാളം (Malayalam)',  promptName: 'Malayalam' },
    { key: 'marathi',    label: '🇮🇳 मराठी (Marathi)',     promptName: 'Marathi' },
    { key: 'gujarati',   label: '🇮🇳 ગુજરાતી (Gujarati)',  promptName: 'Gujarati' },
    { key: 'bengali',    label: '🇮🇳 বাংলা (Bengali)',     promptName: 'Bengali' },
    { key: 'punjabi',    label: '🇮🇳 ਪੰਜਾਬੀ (Punjabi)',    promptName: 'Punjabi' },
    { key: 'odia',       label: '🇮🇳 ଓଡ଼ିଆ (Odia)',        promptName: 'Odia' },
    { key: 'assamese',   label: '🇮🇳 অসমীয়া (Assamese)',  promptName: 'Assamese' },
    { key: 'urdu',       label: '🇮🇳 اردو (Urdu)',         promptName: 'Urdu' },
  ],

  _backendUrl() {
    return typeof CIVICTAG_CONFIG !== 'undefined' ? CIVICTAG_CONFIG.BACKEND_URL : 'https://civictag-api.vercel.app';
  },

  async rewrite(originalTweet, classificationResult, locationResult, _apiKey, targetLanguage = 'auto') {
    if (!classificationResult?.isComplaint) return null;

    const { department, urgency, language: detectedLanguage } = classificationResult;

    try {
      const response = await fetch(`${this._backendUrl()}/api/rewrite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CivicTag-Client': '1' },
        body: JSON.stringify({
          originalTweet,
          department: department || 'General',
          urgency: urgency || 'medium',
          detectedLanguage: detectedLanguage || 'english',
          location: locationResult || null,
          targetLanguage
        })
      });

      if (!response.ok) return null;

      const result = await response.json();
      if (!result?.rewrittenTweet) return null;
      if (result.rewrittenTweet.trim() === originalTweet.trim()) return null;

      return result;
    } catch (err) {
      console.error('CivicTag: Tweet rewriting failed', err);
      return null;
    }
  },

  // kept for backward-compat
  extractAndParseJSON(text) {
    if (!text) return null;
    try { return JSON.parse(text); } catch {}
    const m = text.match(/\{[\s\S]*?\}/);
    if (m) try { return JSON.parse(m[0]); } catch {}
    return null;
  }
};

if (typeof module !== 'undefined' && module.exports) module.exports = TweetRewriter;
