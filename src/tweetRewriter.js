/**
 * tweetRewriter.js
 * AI-powered tweet improvement engine using Groq API
 * Suggests better wording for civic complaints and can translate to any supported language
 */

const TweetRewriter = {

  /**
   * Supported output languages for the dropdown.
   * key: internal identifier, label: display name, promptName: how we instruct Groq
   */
  SUPPORTED_LANGUAGES: [
    { key: 'auto',       label: '🔄 Same as original',  promptName: 'the same language as the original tweet (auto-detect)' },
    { key: 'english',    label: '🇬🇧 English',           promptName: 'English' },
    { key: 'hindi',      label: '🇮🇳 हिंदी (Hindi)',      promptName: 'Hindi (Devanagari script)' },
    { key: 'hinglish',   label: '🇮🇳 Hinglish',          promptName: 'Hinglish (Hindi words written in Roman/English script)' },
    { key: 'tamil',      label: '🇮🇳 தமிழ் (Tamil)',      promptName: 'Tamil' },
    { key: 'telugu',     label: '🇮🇳 తెలుగు (Telugu)',    promptName: 'Telugu' },
    { key: 'kannada',    label: '🇮🇳 ಕನ್ನಡ (Kannada)',    promptName: 'Kannada' },
    { key: 'malayalam',  label: '🇮🇳 മലയാളം (Malayalam)', promptName: 'Malayalam' },
    { key: 'marathi',    label: '🇮🇳 मराठी (Marathi)',    promptName: 'Marathi (Devanagari script)' },
    { key: 'gujarati',   label: '🇮🇳 ગુજરાતી (Gujarati)', promptName: 'Gujarati' },
    { key: 'bengali',    label: '🇮🇳 বাংলা (Bengali)',    promptName: 'Bengali' },
    { key: 'punjabi',    label: '🇮🇳 ਪੰਜਾਬੀ (Punjabi)',   promptName: 'Punjabi (Gurmukhi script)' },
    { key: 'odia',       label: '🇮🇳 ଓଡ଼ିଆ (Odia)',       promptName: 'Odia' },
    { key: 'assamese',   label: '🇮🇳 অসমীয়া (Assamese)', promptName: 'Assamese' },
    { key: 'urdu',       label: '🇮🇳 اردو (Urdu)',        promptName: 'Urdu (Nastaliq script)' },
  ],

  /**
   * Rewrite tweet for maximum impact as a civic complaint.
   * @param {string} originalTweet     - raw tweet text
   * @param {object} classificationResult
   * @param {object} locationResult
   * @param {string} groqApiKey
   * @param {string} [targetLanguage]  - key from SUPPORTED_LANGUAGES (default 'auto')
   */
  async rewrite(originalTweet, classificationResult, locationResult, groqApiKey, targetLanguage = 'auto') {
    if (!groqApiKey) return null;
    if (!classificationResult || !classificationResult.isComplaint) return null;

    const { department, urgency, language: detectedLanguage } = classificationResult;

    let locationStr = '';
    if (locationResult) {
      const parts = [];
      if (locationResult.suburb) parts.push(locationResult.suburb);
      if (locationResult.city)   parts.push(locationResult.city);
      if (locationResult.state)  parts.push(locationResult.state);
      locationStr = parts.filter(Boolean).join(', ');
    }

    // Resolve the output language instruction
    const langEntry = this.SUPPORTED_LANGUAGES.find(l => l.key === targetLanguage)
      || this.SUPPORTED_LANGUAGES[0]; // fallback to auto
    const langInstruction = langEntry.key === 'auto'
      ? `the SAME language as the original tweet (detected: ${detectedLanguage || 'English'})`
      : langEntry.promptName;

    const prompt = `You are an expert at writing effective civic complaint tweets in India.

Original complaint: "${originalTweet}"
Issue type: ${department || 'General'}
Location: ${locationStr || 'Unknown'}
Urgency: ${urgency || 'medium'}
Detected language of original tweet: ${detectedLanguage || 'English'}
Required OUTPUT language: ${langInstruction}

Rewrite this as an effective complaint tweet that:
1. Is clear, specific and factual
2. Mentions the exact location (${locationStr || 'location'}) naturally in the phrase
3. States the problem precisely with any relevant duration if mentioned
4. Has a firm but respectful and non-abusive tone
5. Is under 220 characters (handles and hashtags will be added separately)
6. Is written ONLY in ${langInstruction} — do not mix languages unless the target is Hinglish
7. Does NOT include any Twitter handles (those will be added automatically)
8. Does NOT include hashtags (those will be added automatically)

Return ONLY a JSON object with no markdown:
{
  "rewrittenTweet": "the rewritten tweet text only",
  "outputLanguage": "${langEntry.key === 'auto' ? detectedLanguage || 'english' : langEntry.key}",
  "improvements": ["list of what was improved"],
  "characterCount": number
}`;

    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${groqApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
          max_tokens: 500
        })
      });

      if (!response.ok) return null;

      const data = await response.json();
      if (!data.choices?.[0]?.message) return null;

      const textResponse = data.choices[0].message.content.trim();
      const result = this.extractAndParseJSON(textResponse);

      if (!result || !result.rewrittenTweet) return null;
      if (result.rewrittenTweet.trim() === originalTweet.trim()) return null;

      // Attach the target language key so the UI can show what language was used
      result.targetLanguageKey = langEntry.key === 'auto'
        ? (detectedLanguage || 'english')
        : langEntry.key;
      result.targetLanguageLabel = langEntry.key === 'auto'
        ? `Same as original (${detectedLanguage || 'English'})`
        : langEntry.label;

      return result;
    } catch (err) {
      console.error('CivicTag: Tweet rewriting failed', err);
      return null;
    }
  },

  /**
   * Robust JSON extraction
   */
  extractAndParseJSON(text) {
    if (!text) return null;
    try { return JSON.parse(text); } catch (e) {}
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/```\s*([\s\S]*?)\s*```/);
    if (jsonMatch?.[1]) { try { return JSON.parse(jsonMatch[1].trim()); } catch (e2) {} }
    const firstBrace = text.indexOf('{');
    const lastBrace  = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
      try { return JSON.parse(text.substring(firstBrace, lastBrace + 1)); } catch (e3) {}
    }
    return null;
  }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TweetRewriter;
}
