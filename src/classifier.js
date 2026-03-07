/**
 * classifier.js
 * Handles complaint detection, classification, and location extraction using Groq API
 * Includes debouncing (1500ms), caching (5 min), and keyword fallback
 */

class ComplaintClassifier {
  constructor() {
    this.apiKey = null;
    this.cache = new Map();
    this.cacheExpiry = 300000; // 5 minutes in milliseconds
    this.apiEndpoint = 'https://api.groq.com/openai/v1/chat/completions';
    this.debounceTimer = null;
    this.debounceDelay = 1500; // 1500ms debounce
  }

  /**
   * Initialize the classifier with API key from storage
   */
  async initialize() {
    const result = await chrome.storage.local.get(['groqApiKey']);
    this.apiKey = result.groqApiKey;
    
    if (!this.apiKey) {
      console.warn('CivicTag: Groq API key not configured');
    }
  }

  /**
   * Main classification function with debouncing
   * @param {string} tweetText - The tweet content to classify
   * @returns {Promise<Object>} Classification result
   */
  async classify(tweetText) {
    if (!tweetText || tweetText.trim().length === 0) {
      return null;
    }

    // Clear previous debounce timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    // Return a promise that resolves after debounce
    return new Promise((resolve) => {
      this.debounceTimer = setTimeout(async () => {
        // Check cache first
        const cacheKey = this.getCacheKey(tweetText);
        const cached = this.getFromCache(cacheKey);
        if (cached) {
          console.log('CivicTag: Using cached classification');
          resolve(cached);
          return;
        }

        let result;
        
        if (this.apiKey) {
          try {
            result = await this.classifyWithGroq(tweetText);
          } catch (error) {
            console.error('CivicTag: Groq API error, falling back to keyword matching', error);
            result = this.classifyWithKeywords(tweetText);
          }
        } else {
          // Fallback to keyword matching
          result = this.classifyWithKeywords(tweetText);
        }

        // Cache the result
        if (result && result.isComplaint) {
          this.saveToCache(cacheKey, result);
        }

        resolve(result);
      }, this.debounceDelay);
    });
  }

  /**
   * Classify using Groq API
   */
  async classifyWithGroq(tweetText) {
    const systemPrompt = `You are a civic complaint classifier for India. Analyze the given tweet and return ONLY a valid JSON object with no explanation, no markdown, no backticks. Return this exact structure:
{
  "isComplaint": true/false,
  "confidence": 0-100,
  "department": "freely identified department name in English",
  "subDepartment": "specific sub-department if applicable",
  "urgency": "low/medium/high/critical",
  "locationMentioned": "any location name found in tweet or null",
  "language": "detected language of tweet",
  "suggestedHandles": [],
  "reasoning": "one line explanation"
}

Department can be ANYTHING freely identified — do not limit to preset categories. Examples: Water Supply, Roads & Potholes, Electricity, Sanitation, Garbage Collection, Stray Animals, Illegal Construction, Noise Pollution, Air Pollution, Waterlogging, Tree Falling, Street Lights, Public Transport, Railways, Crime, Cyber Crime, Food Adulteration, Hospital/Health, School/Education, Corruption, Land Encroachment, Fire Safety, Drainage, Sewage, Park Maintenance, Traffic Management.

Urgency rules:
- critical: life threatening, disaster, violence, complete outage >24hrs
- high: major disruption, health risk, safety concern
- medium: ongoing inconvenience, partial service failure
- low: minor issue, suggestion, feedback

Support all Indian languages including Hindi, Tamil, Telugu, Kannada, Malayalam, Bengali, Marathi, Gujarati, Punjabi, and Hinglish. If isComplaint is false, return all other fields as null.`;

    const response = await fetch(this.apiEndpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Classify this tweet: ${tweetText}` }
        ],
        temperature: 0.2,
        max_tokens: 500
      })
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      console.error('CivicTag: Groq API Response:', errorText);
      throw new Error(`Groq API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      throw new Error('Invalid Groq response format');
    }

    const textResponse = data.choices[0].message.content.trim();
    const classification = this.extractAndParseJSON(textResponse);
    
    if (!classification) {
      throw new Error('Could not parse classification JSON from LLM response');
    }
    
    // Validate confidence threshold
    if (classification.confidence < 60) {
      classification.isComplaint = false;
    }

    return classification;
  }

  /**
   * Robust JSON extraction from LLM response
   */
  extractAndParseJSON(text) {
    if (!text) return null;
    
    try {
      // Direct parse
      return JSON.parse(text);
    } catch (e) {
      // Try to extract from markdown blocks
      const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || 
                        text.match(/```\s*([\s\S]*?)\s*```/);
      
      if (jsonMatch && jsonMatch[1]) {
        try {
          return JSON.parse(jsonMatch[1].trim());
        } catch (e2) {}
      }

      // Try to find the first { and last }
      const firstBrace = text.indexOf('{');
      const lastBrace = text.lastIndexOf('}');
      
      if (firstBrace !== -1 && lastBrace !== -1) {
        const candidate = text.substring(firstBrace, lastBrace + 1);
        try {
          return JSON.parse(candidate);
        } catch (e3) {
          console.error('CivicTag: JSON parsing failed', e3);
        }
      }
    }
    return null;
  }

  /**
   * Fallback keyword-based classification
   */
  classifyWithKeywords(tweetText) {
    const text = tweetText.toLowerCase();
    const language = this.detectLanguage(tweetText);
    
    // Complaint indicators
    const complaintKeywords = [
      'no water', 'paani', 'power cut', 'electricity', 'pothole', 'road', 
      'garbage', 'waste', 'sewage', 'crime', 'pollution', 'traffic', 
      'hospital', 'flooding', 'stray', 'construction', 'fire'
    ];

    const hasComplaintKeyword = complaintKeywords.some(kw => text.includes(kw));
    
    if (!hasComplaintKeyword) {
      return {
        isComplaint: false,
        confidence: 30,
        department: null,
        urgency: 'low',
        language: language
      };
    }

    return {
      isComplaint: true,
      confidence: 75,
      department: 'General',
      urgency: 'medium',
      language: language,
      reasoning: 'Detected via keywords'
    };
  }

  /**
   * Detect language of text
   */
  detectLanguage(text) {
    if (/[\u0900-\u097F]/.test(text)) return 'hindi';
    return 'english';
  }

  /**
   * Cache management - UTF-8 safe
   */
  getCacheKey(text) {
    return text.substring(0, 150);
  }

  getFromCache(key) {
    const cached = this.cache.get(key);
    if (cached && (Date.now() - cached.timestamp) < this.cacheExpiry) {
      return cached.data;
    }
    this.cache.delete(key);
    return null;
  }

  saveToCache(key, data) {
    this.cache.set(key, { data, timestamp: Date.now() });
    if (this.cache.size > 100) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ComplaintClassifier;
}
