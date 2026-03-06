/**
 * tweetRewriter.js
 * AI-powered tweet improvement engine using Groq API
 * Suggests better wording for civic complaints to make them more effective
 */

const TweetRewriter = {

  /**
   * Rewrite tweet for maximum impact as a civic complaint
   */
  async rewrite(originalTweet, classificationResult, locationResult, groqApiKey) {
    if (!groqApiKey) {
      return null;
    }

    if (!classificationResult || !classificationResult.isComplaint) {
      return null;
    }

    const { department, urgency, language } = classificationResult;
    let locationStr = '';
    
    if (locationResult) {
      const parts = [];
      if (locationResult.suburb) parts.push(locationResult.suburb);
      if (locationResult.city) parts.push(locationResult.city);
      if (locationResult.state) parts.push(locationResult.state);
      locationStr = parts.filter(Boolean).join(", ");
    }

    const prompt = `You are an expert at writing effective civic complaint tweets in India.

Original complaint: "${originalTweet}"
Issue type: ${department || 'General'}
Location: ${locationStr || 'Unknown'}
Urgency: ${urgency || 'medium'}
Language of original tweet: ${language || 'english'}

Rewrite this as an effective complaint tweet that:
1. Is clear, specific and factual
2. Mentions the exact location (${locationStr || 'location'})
3. States the problem precisely with any relevant duration if mentioned
4. Has a firm but respectful and non-abusive tone
5. Is under 220 characters (handles and hashtags will be added separately)
6. Is written in the SAME language as the original tweet
7. Does NOT include any Twitter handles (those will be added automatically)
8. Does NOT include hashtags (those will be added automatically)
9. If original is in Hindi/Hinglish, rewrite in clean Hindi or Hinglish
10. If original is in English, rewrite in clear English

Return ONLY a JSON object with no markdown:
{
  "rewrittenTweet": "the rewritten tweet text only",
  "improvements": ["list of what was improved"],
  "characterCount": number
}`;

    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${groqApiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "llama3-8b-8192",
          messages: [
            { role: "user", content: prompt }
          ],
          temperature: 0.3,
          max_tokens: 500
        })
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      
      if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        return null;
      }

      const textResponse = data.choices[0].message.content.trim();
      
      // Parse JSON safely
      let jsonText = textResponse;
      if (jsonText.startsWith('```json')) {
        jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      } else if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/```\n?/g, '');
      }
      
      const result = JSON.parse(jsonText);
      
      // Don't show rewriter if suggestion is same as original
      if (result.rewrittenTweet.trim() === originalTweet.trim()) {
        return null;
      }
      
      return result;
    } catch (err) {
      console.error('CivicTag: Tweet rewriting failed', err);
      return null;
    }
  }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TweetRewriter;
}
