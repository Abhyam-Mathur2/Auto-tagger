/**
 * background.js - CivicTag Service Worker
 * Minimal version for stability
 */

console.log('CivicTag: Service worker loaded');

// Install event
chrome.runtime.onInstalled.addListener((details) => {
  console.log('CivicTag: Extension', details.reason);
  
  if (details.reason === 'install') {
    chrome.tabs.create({ url: 'welcome.html' });
  }
});

// Message handler
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('CivicTag: Message -', request.action);
  
  if (request.action === 'recordComplaint') {
    sendResponse({ success: true });
  } else if (request.action === 'getStats') {
    getStats().then(stats => sendResponse(stats));
    return true;
  } else {
    sendResponse({ error: 'Unknown action' });
  }
});

// Get statistics
async function getStats() {
  try {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('CivicTagDB', 1);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    const tx = db.transaction(['complaints'], 'readonly');
    const store = tx.objectStore('complaints');
    
    const complaints = await new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });

    return {
      total: complaints.length,
      open: complaints.filter(c => c.status === 'open').length,
      resolved: complaints.filter(c => c.status === 'resolved').length
    };
  } catch (e) {
    console.error('CivicTag: Stats error', e);
    return { total: 0, open: 0, resolved: 0 };
  }
}

