/**
 * classifier.js
 * Handles complaint detection, classification, and location extraction using Gemini API
 * Includes caching and fallback mechanisms
 */

class ComplaintClassifier {
  constructor() {
    this.apiKey = null;
    this.cache = new Map();
    this.cacheExpiry = 3600000; // 1 hour in milliseconds
    this.apiEndpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';
  }

  /**
   * Initialize the classifier with API key from storage
   */
  async initialize() {
    const result = await chrome.storage.local.get(['gemini_api_key']);
    this.apiKey = result.gemini_api_key;
    
    if (!this.apiKey) {
      console.warn('CivicTag: Gemini API key not configured');
    }
  }

  /**
   * Main classification function
   * @param {string} tweetText - The tweet content to classify
   * @returns {Object} Classification result
   */
  async classify(tweetText) {
    if (!tweetText || tweetText.trim().length === 0) {
      return null;
    }

    // Check cache first
    const cacheKey = this.getCacheKey(tweetText);
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      console.log('CivicTag: Using cached classification');
      return cached;
    }

    let result;
    
    if (this.apiKey) {
      try {
        result = await this.classifyWithGemini(tweetText);
      } catch (error) {
        console.error('CivicTag: Gemini API error, falling back to keyword matching', error);
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

    return result;
  }

  /**
   * Classify using Gemini API
   */
  async classifyWithGemini(tweetText) {
    const prompt = `You are an AI assistant that analyzes tweets to determine if they are civic complaints and extracts key information.

Analyze the following tweet and provide a JSON response with these fields:
- isComplaint (boolean): Is this a civic complaint (not just an opinion or news)?
- confidence (number 0-100): How confident are you?
- category (string): One of: water, electricity, roads, sanitation, crime, pollution, transport, health, cyber_crime, flooding, other
- urgency (string): One of: low, medium, high, critical
- location (object): {city: string or null, district: string or null, state: string or null, specificArea: string or null}
- language (string): Detected language (hindi, english, tamil, telugu, etc.)
- summary (string): Brief one-line summary of the issue

Tweet: "${tweetText}"

Respond ONLY with valid JSON, no markdown formatting:`;

    const response = await fetch(`${this.apiEndpoint}?key=${this.apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }],
        generationConfig: {
          temperature: 0.2,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 1024,
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    const textResponse = data.candidates[0].content.parts[0].text;
    
    // Parse JSON from response (handle markdown code blocks if present)
    let jsonText = textResponse.trim();
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/```\n?/g, '');
    }
    
    const classification = JSON.parse(jsonText);
    
    // Validate confidence threshold
    if (classification.confidence < 70) {
      classification.isComplaint = false;
    }

    return classification;
  }

  /**
   * Fallback keyword-based classification
   */
  classifyWithKeywords(tweetText) {
    const text = tweetText.toLowerCase();
    
    // Complaint indicators
    const complaintKeywords = [
      'no water', 'water supply', 'power cut', 'no electricity', 'no light',
      'pothole', 'road damage', 'garbage', 'cleanliness', 'sewage',
      'theft', 'crime', 'harassment', 'pollution', 'traffic',
      'hospital', 'emergency', 'flooding', 'waterlogging',
      // Hindi keywords
      'पानी नहीं', 'बिजली नहीं', 'गड्ढा', 'कचरा', 'साफ़-सफाई'
    ];

    const hasComplaintKeyword = complaintKeywords.some(kw => text.includes(kw));
    
    if (!hasComplaintKeyword) {
      return {
        isComplaint: false,
        confidence: 30,
        category: 'other',
        urgency: 'low',
        location: {},
        language: this.detectLanguage(tweetText),
        summary: null
      };
    }

    // Determine category
    let category = 'other';
    let urgency = 'medium';
    
    if (text.match(/water|पानी|जल/i)) category = 'water';
    else if (text.match(/electricity|power|light|बिजली/i)) category = 'electricity';
    else if (text.match(/road|pothole|गड्ढा/i)) category = 'roads';
    else if (text.match(/garbage|cleanliness|sanitation|सफाई|कचरा/i)) category = 'sanitation';
    else if (text.match(/crime|theft|robbery|harassment|चोरी/i)) category = 'crime';
    else if (text.match(/pollution|smoke|air quality|प्रदूषण/i)) category = 'pollution';
    else if (text.match(/transport|bus|metro|train/i)) category = 'transport';
    else if (text.match(/hospital|health|doctor|emergency/i)) category = 'health';
    else if (text.match(/flood|waterlog|जलभराव/i)) category = 'flooding';

    // Detect urgency
    if (text.match(/emergency|urgent|immediate|critical|since \d+ days|for \d+ days/i)) {
      urgency = 'critical';
    } else if (text.match(/no water|no electricity|no light|complete|total/i)) {
      urgency = 'high';
    }

    // Basic location extraction
    const location = this.extractLocationKeywords(tweetText);

    return {
      isComplaint: true,
      confidence: 75,
      category,
      urgency,
      location,
      language: this.detectLanguage(tweetText),
      summary: tweetText.substring(0, 100)
    };
  }

  /**
   * Extract location from text using keywords
   */
  extractLocationKeywords(text) {
    const location = {
      city: null,
      district: null,
      state: null,
      specificArea: null
    };

    // Major cities
    const cities = {
      'bangalore': { city: 'Bangalore', state: 'Karnataka' },
      'bengaluru': { city: 'Bangalore', state: 'Karnataka' },
      'mumbai': { city: 'Mumbai', state: 'Maharashtra' },
      'delhi': { city: 'Delhi', state: 'Delhi' },
      'chennai': { city: 'Chennai', state: 'Tamil Nadu' },
      'kolkata': { city: 'Kolkata', state: 'West Bengal' },
      'hyderabad': { city: 'Hyderabad', state: 'Telangana' },
      'pune': { city: 'Pune', state: 'Maharashtra' },
      'ahmedabad': { city: 'Ahmedabad', state: 'Gujarat' },
      'jaipur': { city: 'Jaipur', state: 'Rajasthan' },
      'lucknow': { city: 'Lucknow', state: 'Uttar Pradesh' },
      'surat': { city: 'Surat', state: 'Gujarat' },
      'kanpur': { city: 'Kanpur', state: 'Uttar Pradesh' },
      'nagpur': { city: 'Nagpur', state: 'Maharashtra' },
      'visakhapatnam': { city: 'Visakhapatnam', state: 'Andhra Pradesh' }
    };

    const lowerText = text.toLowerCase();
    for (const [key, value] of Object.entries(cities)) {
      if (lowerText.includes(key)) {
        location.city = value.city;
        location.state = value.state;
        break;
      }
    }

    return location;
  }

  /**
   * Detect language of text
   */
  detectLanguage(text) {
    // Simple language detection based on script
    if (/[\u0900-\u097F]/.test(text)) return 'hindi';
    if (/[\u0C00-\u0C7F]/.test(text)) return 'telugu';
    if (/[\u0B80-\u0BFF]/.test(text)) return 'tamil';
    if (/[\u0C80-\u0CFF]/.test(text)) return 'kannada';
    if (/[\u0A80-\u0AFF]/.test(text)) return 'gujarati';
    if (/[\u0A00-\u0A7F]/.test(text)) return 'punjabi';
    if (/[\u0B00-\u0B7F]/.test(text)) return 'oriya';
    if (/[\u0D00-\u0D7F]/.test(text)) return 'malayalam';
    if (/[\u0B80-\u0BFF]/.test(text)) return 'tamil';
    return 'english';
  }

  /**
   * Cache management
   */
  getCacheKey(text) {
    return btoa(text.substring(0, 100)).substring(0, 32);
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
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });

    // Limit cache size
    if (this.cache.size > 100) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ComplaintClassifier;
}
