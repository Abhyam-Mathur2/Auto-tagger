/**
 * locationDetector.js
 * 4-tier location detection system
 */

class LocationDetector {
  constructor() {
    this.lastNominatimRequestAt = 0;
    this.stateToCities = {
      "Delhi": ["Delhi", "New Delhi"],
      "Karnataka": ["Bengaluru", "Mysuru", "Mangaluru", "Hubli"],
      "Maharashtra": ["Mumbai", "Pune", "Nagpur", "Nashik"],
      "Uttar Pradesh": ["Noida", "Ghaziabad", "Lucknow", "Kanpur"],
      "Tamil Nadu": ["Chennai", "Coimbatore", "Madurai"],
      "Telangana": ["Hyderabad", "Warangal"],
      "West Bengal": ["Kolkata", "Howrah"],
      "Gujarat": ["Ahmedabad", "Surat", "Vadodara"]
    };
  }

  /**
   * Helper for safe storage access
   */
  async getSafeStorage(keys) {
    return await safeStorageGet(keys);
  }

  async initialize() {
    return true;
  }

  async waitForNominatimRateLimit() {
    const elapsed = Date.now() - this.lastNominatimRequestAt;
    if (elapsed < 1000) {
      await new Promise((resolve) => setTimeout(resolve, 1000 - elapsed));
    }
    this.lastNominatimRequestAt = Date.now();
  }

  async getFromBrowser() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Geolocation not supported"));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          try {
            await this.waitForNominatimRateLimit();
            const response = await fetch(
              `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&addressdetails=1`,
              {
                headers: {
                  "Accept-Language": "en",
                  "User-Agent": "CivicTag-Extension/2.0"
                }
              }
            );

            if (!response.ok) {
              throw new Error(`Nominatim error ${response.status}`);
            }

            const data = await response.json();
            const address = data.address || {};

            resolve({
              source: "browser_gps",
              accuracy: "high",
              raw: address,
              city: address.city || address.town || address.village || address.county || null,
              district: address.county || address.state_district || null,
              state: address.state || null,
              pincode: address.postcode || null,
              country: address.country || null,
              suburb: address.suburb || address.neighbourhood || null,
              latitude,
              longitude
            });
          } catch (error) {
            reject(error);
          }
        },
        (error) => reject(error),
        { timeout: 3000, maximumAge: 300000 }
      );
    });
  }

  async getFromTweetText(tweetText, groqApiKey) {
    if (!tweetText || !groqApiKey) {
      return null;
    }

    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${groqApiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "llama-3.1-8b-instant",
          temperature: 0,
          max_tokens: 180,
          messages: [
            {
              role: "system",
              content: "Extract only location fields from the tweet and return strict JSON: {\"city\":string|null,\"district\":string|null,\"state\":string|null,\"suburb\":string|null}. No markdown."
            },
            {
              role: "user",
              content: `Tweet: ${tweetText}`
            }
          ]
        })
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      const rawText = data?.choices?.[0]?.message?.content?.trim();
      if (!rawText) return null;

      const parsed = this.extractAndParseJSON(rawText);
      if (!parsed?.state && !parsed?.city && !parsed?.district) {
        return null;
      }

      return {
        source: "tweet_text",
        accuracy: "medium",
        city: parsed.city || null,
        district: parsed.district || null,
        state: parsed.state || null,
        suburb: parsed.suburb || null
      };
    } catch {
      return null;
    }
  }

  /**
   * Robust JSON extraction
   */
  extractAndParseJSON(text) {
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch (e) {
      const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/```\s*([\s\S]*?)\s*```/);
      if (jsonMatch && jsonMatch[1]) {
        try { return JSON.parse(jsonMatch[1].trim()); } catch (e2) {}
      }
      const firstBrace = text.indexOf('{');
      const lastBrace = text.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1) {
        const candidate = text.substring(firstBrace, lastBrace + 1);
        try { return JSON.parse(candidate); } catch (e3) {}
      }
    }
    return null;
  }

  getFromTwitterProfile() {
    const profileLocation = document.querySelector('[data-testid="UserLocation"]');
    if (!profileLocation?.innerText) {
      return null;
    }

    const rawText = profileLocation.innerText.trim();
    if (!rawText) return null;

    return {
      source: "twitter_profile",
      accuracy: "low",
      rawText
    };
  }

  async getFromSettings() {
    const result = await this.getSafeStorage(["userState", "userCity", "userDistrict", "userSuburb"]);
    
    if (!result.userState && !result.userCity) {
      return null;
    }

    return {
      source: "user_settings",
      accuracy: "medium",
      state: result.userState || null,
      city: result.userCity || null,
      district: result.userDistrict || null,
      suburb: result.userSuburb || null
    };
  }

  async detectLocation(tweetText, groqApiKey) {
    // Try Tweet Text first (fastest and most relevant to the complaint)
    try {
      const tweet = await this.getFromTweetText(tweetText, groqApiKey);
      if (tweet?.state || tweet?.city) return tweet;
    } catch {}

    // Try Settings (instant)
    try {
      const settings = await this.getFromSettings();
      if (settings?.state || settings?.city) return settings;
    } catch {}

    // Try Profile (instant)
    try {
      const profile = this.getFromTwitterProfile();
      if (profile) return profile;
    } catch {}

    // Finally try Browser GPS as a fallback
    try {
      const browser = await this.getFromBrowser();
      if (browser?.state || browser?.city) return browser;
    } catch {}

    return null;
  }

  getAllStates() {
    return Object.keys(this.stateToCities).sort();
  }

  getCitiesForState(state) {
    return this.stateToCities[state] || [];
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = LocationDetector;
}
