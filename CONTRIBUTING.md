# Contributing to CivicTag

Thank you for your interest in contributing to CivicTag! This document provides guidelines for contributing to the project.

## 🎯 Ways to Contribute

### 1. Update Authority Handles

The most valuable contribution is keeping our authority database accurate and up-to-date.

#### How to Update Handles

1. **Fork the repository** on GitHub

2. **Navigate to** `authority_database/`

3. **Find the relevant state/UT file** (e.g., `karnataka.json`, `delhi.json`)

4. **Update the authority information:**
   ```json
   {
     "handle": "@correct_handle",
     "name": "Official Authority Name",
     "verified": true,
     "last_checked": "2024-01-15",
     "source_url": "https://twitter.com/correct_handle"
   }
   ```

5. **Provide verification:**
   - Direct link to Twitter profile
   - Screenshot showing verification badge
   - Official government website listing the handle

6. **Submit a Pull Request** with:
   - Clear title: "Update [Authority Name] handle for [State]"
   - Description with verification proof
   - Reason for change (if correcting an error)

#### Guidelines for Authority Handles

- ✅ **DO** verify the account is official and active
- ✅ **DO** check if the account is verified (blue checkmark)
- ✅ **DO** include source URLs for verification
- ✅ **DO** update `last_checked` date (YYYY-MM-DD format)
- ❌ **DON'T** add unofficial or personal accounts
- ❌ **DON'T** add spam or parody accounts
- ❌ **DON'T** add accounts without verification proof

### 2. Add New Authority Categories

Want to add support for new complaint types?

1. **Update `src/classifier.js`:**
   - Add new category keywords
   - Update category list

2. **Update `src/authorityResolver.js`:**
   - Add resolver function for new category
   - Define escalation hierarchy

3. **Update authority database files:**
   - Add new authority entries for all states
   - Follow existing structure

4. **Submit a PR** with test cases demonstrating the new category

### 3. Report Bugs

Found a bug? Help us fix it!

1. **Check existing issues** to avoid duplicates

2. **Open a new issue** with:
   - Clear, descriptive title
   - Steps to reproduce
   - Expected vs actual behavior
   - Chrome version and OS
   - Screenshots (if applicable)
   - Console errors (if any)

3. **Use the bug report template** provided

### 4. Suggest Features

Have an idea to improve CivicTag?

1. **Open a discussion** in GitHub Discussions

2. **Describe:**
   - The problem your feature solves
   - How it would work
   - Why it's valuable for users
   - Any implementation ideas

3. **Wait for feedback** before starting implementation

### 5. Improve Documentation

Documentation improvements are always welcome!

- Fix typos or unclear instructions
- Add examples or screenshots
- Translate documentation (future)
- Improve code comments

## 🛠️ Development Setup

### Prerequisites

- Chrome browser (version 88+)
- Git
- Text editor (VS Code recommended)
- Node.js 14+ (for validation scripts)

### Getting Started

1. **Clone your fork:**
   ```bash
   git clone https://github.com/YOUR_USERNAME/civictag.git
   cd civictag
   ```

2. **Load the extension:**
   - Open `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `Twitter_Extension` folder

3. **Make your changes**

4. **Test thoroughly:**
   - Reload extension in Chrome
   - Test on Twitter/X
   - Check console for errors
   - Verify authority suggestions

5. **Commit with clear messages:**
   ```bash
   git add .
   git commit -m "feat: Add support for education department in Karnataka"
   ```

6. **Push and create PR:**
   ```bash
   git push origin your-branch-name
   ```

## 📝 Code Style Guidelines

### JavaScript

- Use ES6+ features (const, let, arrow functions)
- Use meaningful variable names
- Add JSDoc comments for functions
- Handle errors gracefully
- Follow existing code style

Example:
```javascript
/**
 * Resolve authorities for a given complaint
 * @param {Object} classification - Complaint classification
 * @param {Object} location - User location
 * @returns {Array} List of authority suggestions
 */
async function resolveAuthorities(classification, location) {
  // Implementation
}
```

### JSON Database

- Use consistent formatting (2 spaces)
- Sort handles alphabetically within categories
- Always include all required fields
- Use lowercase for handle values

Example:
```json
{
  "cm": {
    "handle": "@cmofkarnataka",
    "name": "Chief Minister of Karnataka",
    "verified": true,
    "last_checked": "2024-01-15",
    "source_url": "https://twitter.com/cmofkarnataka"
  }
}
```

## 🧪 Testing

### Manual Testing Checklist

Before submitting a PR, test:

- [ ] Extension loads without errors
- [ ] CivicTag button appears on Twitter compose
- [ ] Classification works for your changes
- [ ] Authority suggestions are accurate
- [ ] No console errors
- [ ] Dashboard displays correctly
- [ ] Settings save properly

### Validation Script

Run the handle validation script:

```bash
export TWITTER_BEARER_TOKEN="your_token"
npm run validate
```

## 🚀 Pull Request Process

1. **Create a feature branch:**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** following the guidelines above

3. **Test thoroughly**

4. **Commit with clear messages:**
   - `feat:` for new features
   - `fix:` for bug fixes
   - `docs:` for documentation
   - `data:` for database updates
   - `refactor:` for code refactoring

5. **Push to your fork:**
   ```bash
   git push origin feature/your-feature-name
   ```

6. **Open a Pull Request** with:
   - Clear title describing the change
   - Description of what and why
   - Screenshots (if UI changes)
   - Testing steps
   - Related issue numbers (if any)

7. **Wait for review** - maintainers will review within 3-5 days

8. **Address feedback** if requested

9. **Celebrate!** 🎉 Once merged, you're a CivicTag contributor!

## 📋 Database Contribution Guidelines

### Finding Inaccurate Handles

Common issues to look for:

- ❌ Suspended accounts
- ❌ Deleted accounts
- ❌ Unofficial/parody accounts
- ❌ Inactive accounts (no tweets in 6+ months)
- ❌ Wrong department handles

### How to Verify Handles

1. **Check Twitter profile:**
   - Verified badge (blue checkmark)
   - Bio mentions official role
   - Recent activity

2. **Check government websites:**
   - Official ministry/department sites
   - State government portals
   - Look for "Follow us" sections

3. **Cross-reference:**
   - Compare with other official sources
   - Check news articles mentioning the handle
   - Look for government press releases

### Database Structure

Each state/UT file should include:

```json
{
  "cm": { ... },           // Chief Minister/Administrator
  "police": { ... },       // Police department
  "electricity": {         // Electricity authorities
    "zones": [
      {
        "name": "BESCOM",
        "handle": "@BESCOM_Official",
        "coverage": ["Bangalore Urban", "..."]
      }
    ]
  },
  "water": { ... },        // Water department
  "municipal": { ... },    // Municipal corporation
  "transport": { ... },    // Transport department
  "pollution": { ... },    // Pollution control
  "health": { ... }        // Health department
}
```

## 🌐 Multi-Language Support (Future)

We plan to add support for regional languages. If you're interested in:

- Translating the UI
- Adding regional language keywords
- Testing with non-English complaints

Please open a discussion to coordinate!

## 📞 Questions?

- **GitHub Discussions:** For questions and general discussion
- **GitHub Issues:** For bug reports only
- **Email:** contribute@civictag.app

## 🙏 Recognition

All contributors will be:

- Listed in the README Contributors section
- Credited in release notes
- Given a shoutout on social media

Thank you for helping make civic engagement better for all Indians! 🇮🇳
