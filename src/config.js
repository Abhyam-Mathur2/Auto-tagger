/**
 * config.js
 * CivicTag extension configuration.
 * UPDATE BACKEND_URL after deploying to Vercel.
 */

const CIVICTAG_CONFIG = {
  // ⚠️ Update this URL after running: vercel deploy --prod in CivicTag-Backend
  BACKEND_URL: 'https://civictag-api.vercel.app',

  VERSION: '2.1.0',
};

// Make available globally in both content script and popup contexts
if (typeof window !== 'undefined') window.CIVICTAG_CONFIG = CIVICTAG_CONFIG;
if (typeof globalThis !== 'undefined') globalThis.CIVICTAG_CONFIG = CIVICTAG_CONFIG;
if (typeof module !== 'undefined' && module.exports) module.exports = CIVICTAG_CONFIG;
