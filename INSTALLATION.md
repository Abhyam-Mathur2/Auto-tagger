# 🚀 CivicTag Installation Guide

Follow these steps to install and configure CivicTag on your Chrome browser.

---

## Step 1: Download the Extension

### Option A: From Chrome Web Store (Coming Soon)
1. Visit the Chrome Web Store listing
2. Click **"Add to Chrome"**
3. Skip to **Step 3**

### Option B: Load Unpacked (Development/Testing)
1. **Download this repository:**
   - Click the green **"Code"** button on GitHub
   - Select **"Download ZIP"**
   - Extract the ZIP file to a folder on your computer

2. **Open Chrome Extensions Page:**
   - Open Chrome browser
   - Navigate to `chrome://extensions/`
   - OR click menu (⋮) → More Tools → Extensions

3. **Enable Developer Mode:**
   - Toggle **"Developer mode"** switch in the top-right corner

4. **Load the Extension:**
   - Click **"Load unpacked"** button
   - Navigate to the extracted folder
   - Select the **`Twitter_Extension`** folder
   - Click **"Select Folder"**

5. **Verify Installation:**
   - You should see the CivicTag card in your extensions list
   - A CivicTag icon will appear in your browser toolbar
   - Welcome page will open automatically

---

## Step 2: Get Your Gemini API Key

CivicTag uses Google's Gemini AI to understand and classify complaints. You need a free API key:

### 2.1 Visit Google AI Studio

1. Open [https://aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
2. Sign in with your Google account (or create one)

### 2.2 Create API Key

1. Click **"Create API Key"** button
2. Select **"Create API key in new project"** (recommended)
3. Your API key will be generated
4. Click the **copy icon** to copy it to clipboard

### 2.3 Important Notes

- ⚠️ **Keep your API key private!** Don't share it publicly
- 💰 **Free tier:** 15 requests/minute, 1 million tokens/month (more than enough)
- 📊 **Monitor usage:** Check your usage at AI Studio dashboard
- 🔒 **Revoke if exposed:** You can always revoke and create a new key

---

## Step 3: Configure CivicTag

### 3.1 Open Extension Settings

1. Click the **CivicTag icon** in your browser toolbar
2. Click on the **"Settings"** tab

### 3.2 Add API Key

1. **Paste your Gemini API key** in the "API Key" field
2. Click **"Save API Key"**
3. You should see a success message

### 3.3 Set Default Location

1. **Select your state** from the dropdown
2. **Enter your city** (e.g., "Bangalore", "Mumbai", "Delhi")
3. Click **"Save Location"**

This helps CivicTag suggest the right local authorities.

---

## Step 4: Test the Extension

### 4.1 Open Twitter/X

1. Navigate to [https://twitter.com](https://twitter.com) or [https://x.com](https://x.com)
2. You may need to refresh the page if you were already there

### 4.2 Compose a Test Tweet

1. Click to **compose a new tweet**
2. Write a sample complaint, for example:
   ```
   Water supply has been disrupted in Indiranagar for 3 days. 
   No updates from authorities. Please resolve urgently.
   ```

### 4.3 Use CivicTag

1. Look for the **"🏷️ CivicTag"** button near the compose box
2. Click **"Analyze Tweet"**
3. A sidebar will appear with suggested authorities
4. Review the suggestions
5. Click on tags to add them to your tweet
6. Post your tweet as normal!

---

## Step 5: Explore the Dashboard

### 5.1 Open Dashboard

Click the **CivicTag icon** in your toolbar to open the dashboard.

### 5.2 Dashboard Tab

View your complaint statistics:
- Total complaints filed
- Open complaints (awaiting response)
- Resolved complaints
- Response rate percentage

### 5.3 Complaints Tab

See a list of all your complaints with:
- Status indicators
- Time since filing
- Quick access to view details

Click any complaint to:
- View full details
- Mark as resolved
- Escalate to higher authorities

### 5.4 Settings Tab

Manage:
- API key
- Default location
- Export complaint data (JSON)
- Clear all data

---

## Troubleshooting

### CivicTag Button Not Appearing

**Problem:** Can't see the CivicTag button on Twitter/X

**Solutions:**
1. Refresh the Twitter/X page
2. Check if extension is enabled at `chrome://extensions/`
3. Try closing and reopening Twitter/X tab
4. Check browser console for errors (F12 → Console)

### "API Key Not Configured" Error

**Problem:** Extension says API key is not set

**Solutions:**
1. Open extension popup → Settings tab
2. Verify API key is pasted correctly (no extra spaces)
3. Click "Save API Key" and wait for confirmation
4. Try refreshing Twitter/X page

### No Authority Suggestions

**Problem:** Sidebar appears but shows no authorities

**Solutions:**
1. Make sure you've set your location in Settings
2. Write a clearer complaint with location mentioned
3. Check that your complaint is about a civic issue
4. Try a different complaint category

### API Key Errors

**Problem:** "Invalid API key" or quota exceeded errors

**Solutions:**
1. Verify key is copied correctly from AI Studio
2. Check you're using a Gemini API key (not other Google services)
3. Check quota limits at [AI Studio dashboard](https://aistudio.google.com)
4. Wait if you've hit rate limits (15 requests/minute)

### Extension Crashes or Won't Load

**Problem:** Extension shows errors or won't load

**Solutions:**
1. Go to `chrome://extensions/`
2. Click **"Remove"** on CivicTag
3. Reinstall following Step 1
4. Restart Chrome browser
5. Check Chrome version (requires v88+)

---

## Tips for Best Results

### 1. Be Specific About Location

Good:
```
Water leak on MG Road near Trinity Metro Station, Bangalore
```

Bad:
```
There's a water leak somewhere
```

### 2. Mention the Issue Category

Good:
```
Street lights not working in Sector 5, Chandigarh for a week
```

Bad:
```
Lights problem
```

### 3. Add Visual Evidence

- Attach photos or videos to your tweet
- Visual evidence gets faster responses

### 4. Use Professional Language

- Be respectful and factual
- Avoid all caps, excessive emojis
- Focus on the issue, not blame

### 5. Follow Up

- Check Dashboard tab for follow-up reminders
- CivicTag will notify you when to escalate
- Don't spam - wait 48-72 hours between follow-ups

---

## Privacy & Data

### What Data Does CivicTag Store?

**Locally (on your device):**
- Your tweets that CivicTag analyzed
- Complaint tracking data (status, responses)
- Your API key (encrypted in browser storage)
- Your saved location

**NOT stored:**
- Your passwords or personal info
- Complete Twitter timeline or DMs
- Any data on external servers

### How to Export Your Data

1. Open extension popup → Settings tab
2. Click **"Export Data"**
3. Save the JSON file to your computer

### How to Delete Your Data

1. Open extension popup → Settings tab
2. Click **"Clear All Data"**
3. Confirm the deletion

This removes all complaints and settings from your device.

---

## Getting Help

### Technical Issues

- **GitHub Issues:** [Report a bug](https://github.com/yourusername/civictag/issues)
- **Email:** support@civictag.app

### Authority Database Updates

- If you find incorrect handles, submit a PR following [CONTRIBUTING.md](CONTRIBUTING.md)
- Or open an issue with the correction

### Feature Requests

- Open a discussion on [GitHub Discussions](https://github.com/yourusername/civictag/discussions)

---

## What's Next?

1. **Start tagging authorities** on your civic complaints
2. **Track responses** in the Dashboard
3. **Follow up** when reminded
4. **Contribute** by updating authority handles
5. **Spread the word** - share CivicTag with fellow citizens!

---

## Uninstallation

If you need to uninstall CivicTag:

1. Go to `chrome://extensions/`
2. Find **CivicTag** in the list
3. Click **"Remove"**
4. Confirm removal

Your local complaint data will be deleted. Export it first if you want to keep it!

---

<div align="center">
  <strong>🇮🇳 Happy Civic Engagement! 🇮🇳</strong>
</div>
