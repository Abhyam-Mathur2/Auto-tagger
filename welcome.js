document.addEventListener('DOMContentLoaded', () => {
  const twitterBtn = document.querySelector('.btn:not(.btn-secondary)');
  const settingsBtn = document.querySelector('.btn-secondary');

  if (twitterBtn) {
    twitterBtn.addEventListener('click', () => {
      chrome.tabs.create({ url: 'https://twitter.com/compose/post' });
      window.close();
    });
  }

  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
      const popupPath = chrome.runtime.getURL('popup.html');
      chrome.tabs.create({ url: popupPath });
    });
  }
});
