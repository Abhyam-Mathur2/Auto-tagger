# 🇮🇳 CivicTag - Smart Authority Tagging for Civic Complaints

**CivicTag** is a Chrome browser extension that automatically suggests and tags the relevant government authorities when you compose a civic complaint on Twitter/X. It works for **all 28 states and 8 Union Territories across India**.

[![Chrome Web Store](https://img.shields.io/badge/Chrome-Extension-brightgreen)](https://chrome.google.com/webstore)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## ✨ Features

### 🤖 AI-Powered Complaint Detection
- Uses **Groq API (Llama 3.1)** to automatically detect civic complaints
- Classifies issues into 10+ categories (water, electricity, roads, crime, etc.)
- Detects urgency levels and confidence scores

### 📍 Smart Location Detection
- 4-layer location detection strategy
- Extracts location from tweet text, profile, or saved settings
- Supports 50+ major cities across India

### 🎯 Accurate Authority Resolution
- Complete database of verified government handles
- Zone-based electricity DISCOM mapping
- Escalation hierarchy: Local → State → Central

### 🛡️ Spam Protection
- Rate limiting (5 complaints/hour)
- Duplicate detection (24-hour window)
- Community complaint consolidation
- Authority overload warnings

### 📊 Accountability Tracking
- IndexedDB-based complaint tracker
- Automatic follow-up reminders (48h, 72h, 7 days)
- Response tracking and statistics
- Export/import complaint data

### 🌐 Multi-Language Support
- Basic detection for Hindi and regional languages
- English fallback for classification

---

## 🚀 Installation

### Option 1: Chrome Web Store (Coming Soon)
1. Visit the [Chrome Web Store listing](#)
2. Click "Add to Chrome"
3. Follow the welcome guide

### Option 2: Load Unpacked (Development)
1. Clone this repository:
   ```bash
   git clone https://github.com/yourusername/civictag.git
   cd civictag
   ```

2. Open Chrome and navigate to `chrome://extensions/`

3. Enable **Developer mode** (toggle in top right)

4. Click **Load unpacked** and select the `Twitter_Extension` folder

5. The CivicTag icon will appear in your toolbar!

---

## ⚙️ Setup

### 1. Get Your Groq API Key

CivicTag requires a Groq API key for AI-powered classification:

1. Visit [Groq Console](https://console.groq.com/keys)
2. Sign in or create an account
3. Click **"Create API Key"**
4. Copy the generated key

**Note:** Groq provides high-performance inference with a generous free tier.

### 2. Configure the Extension

1. Click the **CivicTag** icon in your browser toolbar
2. Go to the **Settings** tab
3. Paste your Groq API key
4. Set your default **State** and **City**
5. Click **Save**

### 3. Start Using!

Head to [Twitter/X](https://twitter.com) and compose a complaint tweet. CivicTag will:
- ✅ Automatically detect your complaint
- ✅ Show a sidebar with suggested authorities
- ✅ Let you tag them with one click
- ✅ Track responses and follow-ups

---

## 📖 Usage Guide

### Composing a Complaint

1. **Open Twitter/X** and click to compose a new tweet
2. **Write your complaint** - be specific about:
   - Location (city, area, landmark)
   - Issue category (water, electricity, roads, etc.)
   - Urgency (if critical)
3. **Look for the CivicTag button** near the compose box
4. **Click "Analyze Tweet"** to get authority suggestions
5. **Review suggestions** in the sidebar
6. **Click tags** to add them to your tweet
7. **Post your tweet** with the authorities tagged!

### Dashboard

Click the CivicTag icon to view:
- **Statistics:** Total complaints, open, resolved, response rate
- **Complaint List:** All your filed complaints with status
- **Follow-ups:** Automatic reminders for pending complaints

### Settings

- **API Key:** Update your Groq API key
- **Location:** Set default state and city
- **Data Management:** Export or clear complaint history

---

## 🗂️ Authority Database

CivicTag maintains a comprehensive database of **verified government handles** for all Indian states and UTs:

### Coverage

- ✅ 28 States
- ✅ 8 Union Territories
- ✅ Central Government handles
- ✅ 500+ authority accounts

### Categories

Each state/UT database includes:
- Chief Minister / Administrator
- Police
- Electricity (zone-based DISCOMs)
- Water
- Municipal Corporations
- Transport
- Pollution Control Board
- Ministry of Health

### Updates

- Database hosted on GitHub Pages
- Automatic weekly update checks
- Community contributions welcome!

---

## 🛠️ Development

### Project Structure

```
Twitter_Extension/
├── manifest.json              # Chrome extension manifest (V3)
├── content.js                 # Main content script
├── content.css                # UI styling
├── background.js              # Service worker
├── popup.html                 # Dashboard UI
├── popup.js                   # Dashboard logic
├── welcome.html               # First-time user guide
├── src/
│   ├── classifier.js          # Groq AI integration
│   ├── authorityResolver.js   # Authority resolution logic
│   ├── locationDetector.js    # Location detection
│   ├── spamGuard.js          # Spam protection
│   └── tracker.js            # IndexedDB tracker
├── authority_database/
│   ├── index.json            # Database index
│   ├── central.json          # Central government
│   ├── karnataka.json        # State databases
│   └── ... (36 more files)
└── scripts/
    └── validate_handles.js   # Twitter handle validator
```

### Tech Stack

- **Manifest V3** Chrome Extension API
- **Groq API** (llama-3.1-8b-instant)
- **IndexedDB** for local storage
- **Vanilla JavaScript** (ES6+)
- **CSS3** with gradient styling

### Running Locally

1. Make changes to the codebase
2. Go to `chrome://extensions/`
3. Click the **refresh icon** on the CivicTag card
4. Test on Twitter/X

### Building for Production

No build step required! This is a pure JavaScript extension.

---

## 🧪 Testing

### Validate Authority Handles

To verify that Twitter handles in the database are valid:

```bash
cd scripts
node validate_handles.js
```

This script:
- Checks all handles using Twitter API v2
- Verifies account existence and status
- Reports invalid/suspended accounts
- Updates `last_checked` timestamps

**Requirements:**
- Node.js 14+
- Twitter API v2 Bearer Token (free tier)

### Manual Testing Checklist

- [ ] Compose a tweet with a clear complaint
- [ ] Verify CivicTag button appears
- [ ] Check authority suggestions are relevant
- [ ] Test tag insertion
- [ ] Verify complaint tracking in dashboard
- [ ] Test follow-up reminders
- [ ] Validate spam protection (try 6+ complaints in 1 hour)

---

## 🤝 Contributing

We welcome contributions! Here's how you can help:

### 1. Update Authority Handles

If you find an incorrect or missing handle:

1. Fork this repository
2. Edit the relevant file in `authority_database/`
3. Update the authority information:
   ```json
   {
     "handle": "@correct_handle",
     "name": "Authority Name",
     "verified": true,
     "last_checked": "2024-01-15",
     "source_url": "https://twitter.com/correct_handle"
   }
   ```
4. Submit a Pull Request with verification proof

### 2. Add New Categories

To add support for new complaint types:

1. Update `src/classifier.js` with new category keywords
2. Add resolution logic in `src/authorityResolver.js`
3. Update authority database files with new handles
4. Submit a PR with test cases

### 3. Report Bugs

Found a bug? [Open an issue](https://github.com/yourusername/civictag/issues) with:
- Chrome version
- Steps to reproduce
- Expected vs actual behavior
- Screenshots (if applicable)

### 4. Suggest Features

Have an idea? [Start a discussion](https://github.com/yourusername/civictag/discussions)!

---

## 📋 Roadmap

### v1.1 (Q2 2024)
- [ ] Firefox and Edge support
- [ ] Regional language UI
- [ ] Offline mode with cached suggestions
- [ ] WhatsApp/Email escalation templates

### v1.2 (Q3 2024)
- [ ] Community voting on authority responsiveness
- [ ] Bulk complaint tracking
- [ ] Integration with government complaint portals
- [ ] Advanced analytics dashboard

### v2.0 (Q4 2024)
- [ ] Mobile app (React Native)
- [ ] Real-time authority response tracking
- [ ] Geo-mapping of complaints
- [ ] Public complaint heatmap

---

## 🙏 Acknowledgments

- **Groq API** for NLP capabilities
- **Twitter/X** for the platform
- **Indian Government** for maintaining official handles
- **Contributors** who verify and update authority data

---

## 📜 License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

---

## 📞 Support

- **Email:** support@civictag.app
- **Twitter:** [@CivicTagIndia](https://twitter.com/CivicTagIndia)
- **Issues:** [GitHub Issues](https://github.com/yourusername/civictag/issues)
- **Discussions:** [GitHub Discussions](https://github.com/yourusername/civictag/discussions)

---

## 🌟 Star This Project

If CivicTag helps you get civic issues resolved, please ⭐ star this repository to show support!

---

<div align="center">
  <strong>Made with ❤️ for a better India</strong>
</div>
