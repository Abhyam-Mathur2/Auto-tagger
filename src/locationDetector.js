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
        { timeout: 10000, maximumAge: 300000 }
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
          model: "llama3-8b-8192",
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
      const raw = data?.choices?.[0]?.message?.content?.trim();
      if (!raw) return null;

      const clean = raw.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
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
    return new Promise((resolve) => {
      chrome.storage.local.get(["userState", "userCity", "userDistrict", "userSuburb"], (result) => {
        if (!result.userState && !result.userCity) {
          resolve(null);
          return;
        }

        resolve({
          source: "user_settings",
          accuracy: "medium",
          state: result.userState || null,
          city: result.userCity || null,
          district: result.userDistrict || null,
          suburb: result.userSuburb || null
        });
      });
    });
  }

  async detectLocation(tweetText, groqApiKey) {
    try {
      const browser = await this.getFromBrowser();
      if (browser?.state || browser?.city) return browser;
    } catch {}

    try {
      const tweet = await this.getFromTweetText(tweetText, groqApiKey);
      if (tweet?.state || tweet?.city) return tweet;
    } catch {}

    try {
      const profile = this.getFromTwitterProfile();
      if (profile) return profile;
    } catch {}

    return this.getFromSettings();
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
