/**
 * locationDetector.js
 * Multi-layered location detection:
 * 1. Extract from tweet text (NLP)
 * 2. Read from Twitter profile
 * 3. Use saved user settings
 * 4. Manual location picker
 */

class LocationDetector {
  constructor() {
    this.savedLocation = null;
  }

  /**
   * Initialize and load saved location
   */
  async initialize() {
    const result = await chrome.storage.local.get(['saved_location']);
    this.savedLocation = result.saved_location || null;
  }

  /**
   * Detect location using all available methods
   * @param {string} tweetText - Tweet content
   * @param {Object} classification - Classification from Gemini (may contain location)
   * @returns {Object} Resolved location
   */
  async detectLocation(tweetText, classification) {
    let location = {
      state: null,
      city: null,
      district: null,
      zone: null,
      source: null,
      confidence: 0
    };

    // Priority 1: Location from classification (Gemini already extracted it)
    if (classification && classification.location) {
      const classifiedLoc = classification.location;
      if (classifiedLoc.state || classifiedLoc.city) {
        location = {
          state: classifiedLoc.state,
          city: classifiedLoc.city,
          district: classifiedLoc.district,
          zone: null,
          specificArea: classifiedLoc.specificArea,
          source: 'tweet_text',
          confidence: 90
        };
        
        // Normalize state name
        if (location.state) {
          location.state = this.normalizeStateName(location.state);
        }
        
        if (location.state && location.city) {
          return location;
        }
      }
    }

    // Priority 2: Extract from tweet text manually if Gemini missed it
    const extractedLocation = this.extractLocationFromText(tweetText);
    if (extractedLocation.state || extractedLocation.city) {
      return {
        ...extractedLocation,
        source: 'tweet_text_parsed',
        confidence: 80
      };
    }

    // Priority 3: Read from Twitter profile
    const profileLocation = this.getProfileLocation();
    if (profileLocation.state || profileLocation.city) {
      return {
        ...profileLocation,
        source: 'twitter_profile',
        confidence: 70
      };
    }

    // Priority 4: Use saved location
    if (this.savedLocation && (this.savedLocation.state || this.savedLocation.city)) {
      return {
        ...this.savedLocation,
        source: 'saved_settings',
        confidence: 60
      };
    }

    // Priority 5: Needs manual selection
    return {
      state: null,
      city: null,
      district: null,
      zone: null,
      source: 'manual_required',
      confidence: 0
    };
  }

  /**
   * Extract location from tweet text
   */
  extractLocationFromText(text) {
    const location = {
      state: null,
      city: null,
      district: null,
      zone: null
    };

    const lowerText = text.toLowerCase();

    // State and city mapping
    const locationDatabase = this.getLocationDatabase();

    // Check for cities first (more specific)
    for (const [city, data] of Object.entries(locationDatabase.cities)) {
      if (lowerText.includes(city.toLowerCase())) {
        location.city = data.name;
        location.state = data.state;
        return location;
      }
    }

    // Check for states
    for (const [key, stateName] of Object.entries(locationDatabase.states)) {
      if (lowerText.includes(key.toLowerCase())) {
        location.state = stateName;
        return location;
      }
    }

    // Check for area-specific keywords (zones, localities)
    const areaMatch = lowerText.match(/\b(in|at|near)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/);
    if (areaMatch) {
      location.specificArea = areaMatch[2];
    }

    return location;
  }

  /**
   * Get location from Twitter profile
   */
  getProfileLocation() {
    const location = {
      state: null,
      city: null,
      district: null,
      zone: null
    };

    try {
      // Try to find profile location element
      // Twitter/X structure: look for location in profile
      const locationElements = [
        document.querySelector('[data-testid="UserProfileHeader_Items"] span[data-testid="UserLocation"]'),
        document.querySelector('span[data-testid="UserLocation"]'),
        document.querySelector('[data-testid="UserDescription"]')
      ];

      for (const element of locationElements) {
        if (element && element.textContent) {
          const profileText = element.textContent.trim();
          const extracted = this.extractLocationFromText(profileText);
          if (extracted.state || extracted.city) {
            return extracted;
          }
        }
      }
    } catch (error) {
      console.error('CivicTag: Error reading profile location', error);
    }

    return location;
  }

  /**
   * Save location to storage
   */
  async saveLocation(location) {
    this.savedLocation = location;
    await chrome.storage.local.set({ saved_location: location });
  }

  /**
   * Normalize state name to standard format
   */
  normalizeStateName(stateName) {
    if (!stateName) return null;

    const stateMapping = {
      'karnataka': 'Karnataka',
      'maharashtra': 'Maharashtra',
      'delhi': 'Delhi',
      'tamil nadu': 'Tamil Nadu',
      'tamilnadu': 'Tamil Nadu',
      'uttar pradesh': 'Uttar Pradesh',
      'up': 'Uttar Pradesh',
      'west bengal': 'West Bengal',
      'wb': 'West Bengal',
      'telangana': 'Telangana',
      'andhra pradesh': 'Andhra Pradesh',
      'ap': 'Andhra Pradesh',
      'rajasthan': 'Rajasthan',
      'gujarat': 'Gujarat',
      'punjab': 'Punjab',
      'haryana': 'Haryana',
      'madhya pradesh': 'Madhya Pradesh',
      'mp': 'Madhya Pradesh',
      'kerala': 'Kerala',
      'bihar': 'Bihar',
      'odisha': 'Odisha',
      'orissa': 'Odisha',
      'jharkhand': 'Jharkhand',
      'assam': 'Assam',
      'chhattisgarh': 'Chhattisgarh',
      'uttarakhand': 'Uttarakhand',
      'himachal pradesh': 'Himachal Pradesh',
      'hp': 'Himachal Pradesh',
      'goa': 'Goa',
      'chandigarh': 'Chandigarh',
      'puducherry': 'Puducherry',
      'pondicherry': 'Puducherry',
      'jammu and kashmir': 'Jammu & Kashmir',
      'j&k': 'Jammu & Kashmir',
      'ladakh': 'Ladakh',
      'manipur': 'Manipur',
      'meghalaya': 'Meghalaya',
      'mizoram': 'Mizoram',
      'nagaland': 'Nagaland',
      'sikkim': 'Sikkim',
      'tripura': 'Tripura',
      'arunachal pradesh': 'Arunachal Pradesh'
    };

    const key = stateName.toLowerCase().trim();
    return stateMapping[key] || stateName;
  }

  /**
   * Get location database for matching
   */
  getLocationDatabase() {
    return {
      states: {
        'karnataka': 'Karnataka',
        'maharashtra': 'Maharashtra',
        'delhi': 'Delhi',
        'tamil nadu': 'Tamil Nadu',
        'uttar pradesh': 'Uttar Pradesh',
        'west bengal': 'West Bengal',
        'telangana': 'Telangana',
        'andhra pradesh': 'Andhra Pradesh',
        'rajasthan': 'Rajasthan',
        'gujarat': 'Gujarat',
        'punjab': 'Punjab',
        'haryana': 'Haryana',
        'madhya pradesh': 'Madhya Pradesh',
        'kerala': 'Kerala',
        'bihar': 'Bihar',
        'odisha': 'Odisha',
        'jharkhand': 'Jharkhand',
        'assam': 'Assam',
        'chhattisgarh': 'Chhattisgarh',
        'uttarakhand': 'Uttarakhand',
        'himachal pradesh': 'Himachal Pradesh',
        'goa': 'Goa'
      },
      cities: {
        'bangalore': { name: 'Bangalore', state: 'Karnataka' },
        'bengaluru': { name: 'Bangalore', state: 'Karnataka' },
        'mumbai': { name: 'Mumbai', state: 'Maharashtra' },
        'bombay': { name: 'Mumbai', state: 'Maharashtra' },
        'delhi': { name: 'Delhi', state: 'Delhi' },
        'new delhi': { name: 'Delhi', state: 'Delhi' },
        'chennai': { name: 'Chennai', state: 'Tamil Nadu' },
        'madras': { name: 'Chennai', state: 'Tamil Nadu' },
        'kolkata': { name: 'Kolkata', state: 'West Bengal' },
        'calcutta': { name: 'Kolkata', state: 'West Bengal' },
        'hyderabad': { name: 'Hyderabad', state: 'Telangana' },
        'pune': { name: 'Pune', state: 'Maharashtra' },
        'ahmedabad': { name: 'Ahmedabad', state: 'Gujarat' },
        'jaipur': { name: 'Jaipur', state: 'Rajasthan' },
        'lucknow': { name: 'Lucknow', state: 'Uttar Pradesh' },
        'surat': { name: 'Surat', state: 'Gujarat' },
        'kanpur': { name: 'Kanpur', state: 'Uttar Pradesh' },
        'nagpur': { name: 'Nagpur', state: 'Maharashtra' },
        'visakhapatnam': { name: 'Visakhapatnam', state: 'Andhra Pradesh' },
        'vizag': { name: 'Visakhapatnam', state: 'Andhra Pradesh' },
        'bhopal': { name: 'Bhopal', state: 'Madhya Pradesh' },
        'patna': { name: 'Patna', state: 'Bihar' },
        'ludhiana': { name: 'Ludhiana', state: 'Punjab' },
        'agra': { name: 'Agra', state: 'Uttar Pradesh' },
        'nashik': { name: 'Nashik', state: 'Maharashtra' },
        'vadodara': { name: 'Vadodara', state: 'Gujarat' },
        'baroda': { name: 'Vadodara', state: 'Gujarat' },
        'rajkot': { name: 'Rajkot', state: 'Gujarat' },
        'meerut': { name: 'Meerut', state: 'Uttar Pradesh' },
        'gurgaon': { name: 'Gurugram', state: 'Haryana' },
        'gurugram': { name: 'Gurugram', state: 'Haryana' },
        'noida': { name: 'Noida', state: 'Uttar Pradesh' },
        'faridabad': { name: 'Faridabad', state: 'Haryana' },
        'ghaziabad': { name: 'Ghaziabad', state: 'Uttar Pradesh' },
        'kochi': { name: 'Kochi', state: 'Kerala' },
        'cochin': { name: 'Kochi', state: 'Kerala' },
        'coimbatore': { name: 'Coimbatore', state: 'Tamil Nadu' },
        'mysore': { name: 'Mysuru', state: 'Karnataka' },
        'mysuru': { name: 'Mysuru', state: 'Karnataka' },
        'thiruvananthapuram': { name: 'Thiruvananthapuram', state: 'Kerala' },
        'trivandrum': { name: 'Thiruvananthapuram', state: 'Kerala' },
        'indore': { name: 'Indore', state: 'Madhya Pradesh' },
        'chandigarh': { name: 'Chandigarh', state: 'Chandigarh' },
        'bhubaneswar': { name: 'Bhubaneswar', state: 'Odisha' },
        'ranchi': { name: 'Ranchi', state: 'Jharkhand' },
        'guwahati': { name: 'Guwahati', state: 'Assam' },
        'dehradun': { name: 'Dehradun', state: 'Uttarakhand' },
        'raipur': { name: 'Raipur', state: 'Chhattisgarh' },
        'jamshedpur': { name: 'Jamshedpur', state: 'Jharkhand' },
        'amritsar': { name: 'Amritsar', state: 'Punjab' },
        'varanasi': { name: 'Varanasi', state: 'Uttar Pradesh' },
        'banaras': { name: 'Varanasi', state: 'Uttar Pradesh' },
        'allahabad': { name: 'Prayagraj', state: 'Uttar Pradesh' },
        'prayagraj': { name: 'Prayagraj', state: 'Uttar Pradesh' }
      }
    };
  }

  /**
   * Get list of all states for dropdown
   */
  getAllStates() {
    return [
      'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
      'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand',
      'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
      'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
      'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
      'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
      'Andaman & Nicobar Islands', 'Chandigarh', 'Dadra & Nagar Haveli and Daman & Diu',
      'Delhi', 'Jammu & Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry'
    ];
  }

  /**
   * Get major cities for a state
   */
  getCitiesForState(state) {
    const citiesByState = {
      'Karnataka': ['Bangalore', 'Mysuru', 'Mangalore', 'Hubli-Dharwad', 'Belgaum'],
      'Maharashtra': ['Mumbai', 'Pune', 'Nagpur', 'Nashik', 'Aurangabad', 'Thane'],
      'Delhi': ['New Delhi', 'Delhi'],
      'Tamil Nadu': ['Chennai', 'Coimbatore', 'Madurai', 'Salem', 'Tiruchirappalli'],
      'Uttar Pradesh': ['Lucknow', 'Kanpur', 'Ghaziabad', 'Agra', 'Varanasi', 'Meerut', 'Noida', 'Prayagraj'],
      'West Bengal': ['Kolkata', 'Howrah', 'Durgapur', 'Asansol', 'Siliguri'],
      'Telangana': ['Hyderabad', 'Warangal', 'Nizamabad', 'Khammam'],
      'Gujarat': ['Ahmedabad', 'Surat', 'Vadodara', 'Rajkot', 'Bhavnagar'],
      'Rajasthan': ['Jaipur', 'Jodhpur', 'Kota', 'Bikaner', 'Udaipur'],
      'Kerala': ['Thiruvananthapuram', 'Kochi', 'Kozhikode', 'Thrissur'],
      'Punjab': ['Ludhiana', 'Amritsar', 'Jalandhar', 'Patiala'],
      'Haryana': ['Gurugram', 'Faridabad', 'Panipat', 'Ambala', 'Rohtak'],
      'Madhya Pradesh': ['Bhopal', 'Indore', 'Gwalior', 'Jabalpur', 'Ujjain'],
      'Andhra Pradesh': ['Visakhapatnam', 'Vijayawada', 'Guntur', 'Tirupati'],
      'Odisha': ['Bhubaneswar', 'Cuttack', 'Rourkela', 'Puri'],
      'Bihar': ['Patna', 'Gaya', 'Bhagalpur', 'Muzaffarpur'],
      'Assam': ['Guwahati', 'Silchar', 'Dibrugarh', 'Jorhat'],
      'Jharkhand': ['Ranchi', 'Jamshedpur', 'Dhanbad', 'Bokaro'],
      'Chhattisgarh': ['Raipur', 'Bhilai', 'Bilaspur', 'Korba'],
      'Uttarakhand': ['Dehradun', 'Haridwar', 'Roorkee', 'Haldwani'],
      'Goa': ['Panaji', 'Margao', 'Vasco da Gama'],
      'Himachal Pradesh': ['Shimla', 'Dharamshala', 'Solan', 'Mandi']
    };

    return citiesByState[state] || [];
  }

  /**
   * Check if it's monsoon season (for flooding priority)
   */
  isMonsoonSeason() {
    const month = new Date().getMonth() + 1; // 1-12
    return month >= 6 && month <= 9; // June to September
  }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = LocationDetector;
}
