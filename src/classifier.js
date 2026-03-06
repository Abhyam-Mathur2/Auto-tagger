/**
 * classifier.js
 * Handles complaint detection, classification, and location extraction using Groq API (Llama 3)
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
   * Classify using Groq API (Llama 3)
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
        model: 'llama3-8b-8192',
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
    
    // Parse JSON from response (handle any markdown code blocks if present)
    let jsonText = textResponse;
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
    const language = this.detectLanguage(tweetText);
    
    // Complaint indicators (English + Hindi)
    const complaintKeywords = [
      'no water', 'water supply', 'water crisis', 'water pipeline', 'water leakage',
      'power cut', 'no electricity', 'no light', 'power outage', 'transformer',
      'pothole', 'road damage', 'broken road', 'speed breaker',
      'garbage', 'cleanliness', 'waste', 'waste collection', 'sewage', 'gutter',
      'theft', 'crime', 'harassment', 'assault', 'accident',
      'pollution', 'smoke', 'air quality', 'noise pollution',
      'traffic', 'traffic jam', 'parking', 'accident',
      'hospital', 'emergency', 'ambulance', 'medicine',
      'flooding', 'waterlogging', 'rain', 'drainage',
      'stray', 'dog', 'animal', 'snake',
      'construction', 'encroachment', 'illegal building',
      'school', 'college', 'education', 'teacher',
      'railway', 'station', 'train', 'bus', 'metro',
      'fire', 'safety', 'hazard',
      'tree', 'park', 'garden',
      'corruption', 'bribe',
      // Hindi keywords
      'पानी नहीं', 'बिजली नहीं', 'गड्ढा', 'कचरा', 'साफ़-सफाई', 'सड़क',
      'चोरी', 'अपराध', 'परेशानी', 'समस्या', 'प्रदूषण',
      'बाढ़', 'ट्रैफिक', 'अस्पताल', 'पेड़', 'आग'
    ];

    const hasComplaintKeyword = complaintKeywords.some(kw => text.includes(kw));
    
    if (!hasComplaintKeyword) {
      return {
        isComplaint: false,
        confidence: 30,
        department: null,
        subDepartment: null,
        urgency: 'low',
        locationMentioned: null,
        language: language,
        suggestedHandles: [],
        reasoning: 'No complaint indicators found'
      };
    }

    // Determine department
    let department = 'General';
    
    if (text.match(/water|पानी|जल|नल|वाटर/i)) department = 'Water Supply';
    else if (text.match(/electricity|power|light|बिजली|करंट|लाइट/i)) department = 'Electricity';
    else if (text.match(/road|pothole|गड्ढा|सड़क|हाईवे|मार्ग/i)) department = 'Roads & Potholes';
    else if (text.match(/garbage|cleanliness|sanitation|सफाई|कचरा|कूड़ा|स्वच्छता/i)) department = 'Sanitation';
    else if (text.match(/crime|theft|robbery|harassment|चोरी|अपराध/i)) department = 'Crime';
    else if (text.match(/pollution|smoke|air quality|प्रदूषण|धुआं/i)) department = 'Pollution';
    else if (text.match(/transport|bus|metro|train|सार्वजनिक परिवहन/i)) department = 'Public Transport';
    else if (text.match(/hospital|health|doctor|emergency|अस्पताल/i)) department = 'Hospital/Health';
    else if (text.match(/flood|waterlog|rain|बाढ़|जलभराव|बारिश/i)) department = 'Drainage';
    else if (text.match(/stray|dog|animal|street animals|आवारा/i)) department = 'Animal Control';
    else if (text.match(/construction|encroachment|illegal|निर्माण/i)) department = 'Building Department';
    else if (text.match(/traffic|signal|parking|ट्रैफिक/i)) department = 'Traffic Management';

    // Detect urgency
    let urgency = 'medium';
    if (text.match(/emergency|urgent|immediate|critical|since \d+ days|for \d+ days|दिन|तुरंत/i)) {
      urgency = 'critical';
    } else if (text.match(/no water|no electricity|no light|complete|total|नहीं|बंद|पूरा/i)) {
      urgency = 'high';
    }

    // Basic location extraction
    const locationMentioned = this.extractLocationKeywords(tweetText);

    return {
      isComplaint: true,
      confidence: 75,
      department: department,
      subDepartment: null,
      urgency: urgency,
      locationMentioned: locationMentioned,
      language: language,
      suggestedHandles: [],
      reasoning: 'Complaint detected via keyword matching'
    };
  }

  /**
   * Extract location from text using keywords
   */
  extractLocationKeywords(text) {
    const majorCities = {
      'bangalore': 'Bangalore', 'bengaluru': 'Bangalore',
      'mumbai': 'Mumbai',
      'delhi': 'Delhi',
      'chennai': 'Chennai',
      'kolkata': 'Kolkata',
      'hyderabad': 'Hyderabad',
      'pune': 'Pune',
      'ahmedabad': 'Ahmedabad',
      'jaipur': 'Jaipur',
      'lucknow': 'Lucknow',
      'surat': 'Surat',
      'kanpur': 'Kanpur',
      'nagpur': 'Nagpur',
      'visakhapatnam': 'Visakhapatnam',
      'ghaziabad': 'Ghaziabad',
      'noida': 'Noida',
      'indirapuram': 'Indirapuram'
    };

    const lowerText = text.toLowerCase();
    for (const [key, city] of Object.entries(majorCities)) {
      if (lowerText.includes(key)) {
        return city;
      }
    }
    
    return null;
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
    // Hinglish detection (mix of Hindi and English)
    if (/[\u0900-\u097F]/.test(text) && /[a-zA-Z]/.test(text)) return 'hinglish';
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

    // Limit cache size to 100 entries
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
