/**
 * utils.js
 * Common utilities for CivicTag extension
 */

/**
 * Check if the extension context is still valid.
 * This is the most reliable way to check for "Extension context invalidated".
 */
function isContextValid() {
  try {
    // When context is invalidated, accessing any chrome.* API property usually fails
    // or chrome.runtime.id becomes undefined.
    return !!(typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id);
  } catch (e) {
    return false;
  }
}

/**
 * Safe wrapper for chrome.storage.local.get
 */
async function safeStorageGet(keys) {
  if (!isContextValid()) return {};
  try {
    return await chrome.storage.local.get(keys);
  } catch (e) {
    // Handle the error specifically if it's an invalidation error
    const msg = e.message || String(e);
    if (msg.includes('context invalidated') || msg.includes('Extension context invalidated')) {
       console.warn('CivicTag: Extension context invalidated. Please refresh the page.');
    } else {
       console.error('CivicTag: Storage access failed', e);
    }
    return {};
  }
}

/**
 * Safe wrapper for chrome.storage.local.set
 */
async function safeStorageSet(data) {
  if (!isContextValid()) return false;
  try {
    await chrome.storage.local.set(data);
    return true;
  } catch (e) {
    const msg = e.message || String(e);
    if (msg.includes('context invalidated') || msg.includes('Extension context invalidated')) {
       console.warn('CivicTag: Extension context invalidated. Please refresh the page.');
    } else {
       console.error('CivicTag: Storage set failed', e);
    }
    return false;
  }
}

// Export if in node environment
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { isContextValid, safeStorageGet, safeStorageSet };
}
