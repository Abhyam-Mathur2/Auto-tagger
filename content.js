/**
 * content.js
 * Main content script that injects CivicTag UI into Twitter/X
 */

// Import modules (they will be loaded via the extension)
let classifier, authorityResolver, locationDetector, spamGuard, tracker;

// State
let currentTweetText = '';
let isAnalyzing = false;
let civicTagButton = null;
let sidebar = null;

/**
 * Initialize the extension
 */
async function initialize() {
  console.log('CivicTag: Initializing...');

  try {
    // Initialize all modules
    classifier = new ComplaintClassifier();
    await classifier.initialize();

    authorityResolver = new AuthorityResolver();
    await authorityResolver.initialize();

    locationDetector = new LocationDetector();
    await locationDetector.initialize();

    spamGuard = new SpamGuard();

    tracker = new ComplaintTracker();
    await tracker.initialize();

    console.log('CivicTag: All modules initialized');

    // Inject UI
    injectCivicTagUI();

    // Watch for compose box
    observeTwitterCompose();

  } catch (error) {
    console.error('CivicTag: Initialization error', error);
  }
}

/**
 * Inject CivicTag button and sidebar
 */
function injectCivicTagUI() {
  // Check if we're on Twitter/X
  if (!window.location.hostname.includes('twitter.com') && 
      !window.location.hostname.includes('x.com')) {
    return;
  }

  // Wait for compose box to appear
  const checkInterval = setInterval(() => {
    const composeBox = findComposeBox();
    if (composeBox && !civicTagButton) {
      injectButton(composeBox);
      clearInterval(checkInterval);
    }
  }, 1000);
}

/**
 * Find Twitter compose box
 */
function findComposeBox() {
  // Twitter/X compose box selectors (may need updating based on Twitter changes)
  const selectors = [
    '[data-testid="tweetTextarea_0"]',
    '[data-testid="tweetButton"]',
    'div[role="textbox"][data-testid*="tweet"]',
    'div[contenteditable="true"][role="textbox"]'
  ];

  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element) {
      // Find the parent container
      let parent = element;
      for (let i = 0; i < 10; i++) {
        parent = parent.parentElement;
        if (parent && parent.querySelector('[data-testid="tweetButton"]')) {
          return parent;
        }
      }
      return element.closest('[role="group"]') || element.parentElement;
    }
  }

  return null;
}

/**
 * Inject CivicTag button
 */
function injectButton(composeContainer) {
  if (civicTagButton) return;

  civicTagButton = document.createElement('button');
  civicTagButton.id = 'civictag-button';
  civicTagButton.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
    </svg>
    <span>CivicTag 🇮🇳</span>
  `;
  civicTagButton.title = 'Tag relevant authorities for your complaint';

  civicTagButton.addEventListener('click', handleCivicTagClick);

  // Find toolbar to insert button
  const toolbar = composeContainer.querySelector('[data-testid="toolBar"]') ||
                  composeContainer.querySelector('[role="group"]');

  if (toolbar) {
    toolbar.appendChild(civicTagButton);
  } else {
    composeContainer.appendChild(civicTagButton);
  }

  console.log('CivicTag: Button injected');
}

/**
 * Handle CivicTag button click
 */
async function handleCivicTagClick(e) {
  e.preventDefault();
  e.stopPropagation();

  if (isAnalyzing) return;

  // Get tweet text
  const tweetText = getTweetText();
  if (!tweetText || tweetText.trim().length === 0) {
    showNotification('Please write your complaint first', 'warning');
    return;
  }

  // Check rate limit
  const rateCheck = await spamGuard.checkRateLimit();
  if (!rateCheck.allowed) {
    showNotification(rateCheck.message, 'error');
    return;
  }

  // Analyze tweet
  await analyzeTweet(tweetText);
}

/**
 * Get current tweet text
 */
function getTweetText() {
  const textbox = document.querySelector('[data-testid="tweetTextarea_0"]') ||
                  document.querySelector('div[contenteditable="true"][role="textbox"]');
  
  if (textbox) {
    return textbox.textContent || textbox.innerText || '';
  }
  return '';
}

/**
 * Analyze tweet and show suggestions
 */
async function analyzeTweet(tweetText) {
  isAnalyzing = true;
  showNotification('Analyzing your complaint...', 'info');

  try {
    // Classify complaint
    const classification = await classifier.classify(tweetText);

    if (!classification || !classification.isComplaint || classification.confidence < 70) {
      showNotification('This doesn\'t appear to be a civic complaint. CivicTag works best for infrastructure and service complaints.', 'warning');
      isAnalyzing = false;
      return;
    }

    // Detect location
    const location = await locationDetector.detectLocation(tweetText, classification);

    if (!location.state) {
      // Show location selector
      showLocationSelector(classification, tweetText);
      isAnalyzing = false;
      return;
    }

    // Check for duplicates
    const duplicateCheck = await spamGuard.checkDuplicate(classification.category, location);
    if (duplicateCheck.isDuplicate) {
      showDuplicateWarning(duplicateCheck, classification, location);
      isAnalyzing = false;
      return;
    }

    // Check for consolidation opportunity
    const consolidationCheck = await spamGuard.checkConsolidation(classification.category, location);

    // Resolve authorities
    const authorities = await authorityResolver.resolveAuthorities(classification, location);

    if (authorities.length === 0) {
      showNotification('Could not find relevant authorities for this complaint', 'error');
      isAnalyzing = false;
      return;
    }

    // Check authority overload
    const overloadCheck = await spamGuard.checkAuthorityOverload(authorities, classification.category);

    // Get hashtags
    const hashtags = authorityResolver.getHashtagsForCategory(classification.category, location);

    // Show sidebar with suggestions
    showSidebar({
      classification,
      location,
      authorities,
      hashtags,
      consolidation: consolidationCheck,
      overload: overloadCheck,
      tweetText
    });

  } catch (error) {
    console.error('CivicTag: Analysis error', error);
    showNotification('Error analyzing complaint. Please try again.', 'error');
  }

  isAnalyzing = false;
}

/**
 * Show sidebar with suggestions
 */
function showSidebar(data) {
  // Remove existing sidebar
  if (sidebar) {
    sidebar.remove();
  }

  sidebar = document.createElement('div');
  sidebar.id = 'civictag-sidebar';
  sidebar.innerHTML = `
    <div class="civictag-sidebar-header">
      <h3>🇮🇳 CivicTag Suggestions</h3>
      <button class="civictag-close" id="civictag-sidebar-close">×</button>
    </div>
    
    <div class="civictag-sidebar-content">
      <div class="civictag-section">
        <h4>Detected Issue</h4>
        <div class="civictag-badge civictag-badge-${data.classification.urgency}">
          ${data.classification.category.toUpperCase()} - ${data.classification.urgency.toUpperCase()}
        </div>
        <p class="civictag-summary">${data.classification.summary || data.tweetText.substring(0, 100)}</p>
      </div>

      <div class="civictag-section">
        <h4>Location</h4>
        <p>${data.location.city || 'Not specified'}, ${data.location.state}</p>
        <small>Detected from: ${data.location.source}</small>
      </div>

      ${data.consolidation.shouldConsolidate ? `
        <div class="civictag-section civictag-consolidation">
          <h4>⚠️ Community Alert</h4>
          <p>${data.consolidation.message}</p>
          <button class="civictag-btn civictag-btn-secondary" id="civictag-use-consolidated">
            Use Collective Complaint
          </button>
        </div>
      ` : ''}

      <div class="civictag-section">
        <h4>Suggested Authorities <span class="civictag-count">${data.authorities.length}</span></h4>
        <div class="civictag-authorities">
          ${data.authorities.map((auth, idx) => `
            <label class="civictag-authority-item">
              <input type="checkbox" checked data-handle="${auth.handle}" />
              <div>
                <strong>${auth.handle}</strong>
                <small>${auth.name} (${auth.level})</small>
                ${auth.note ? `<small class="civictag-note">${auth.note}</small>` : ''}
              </div>
            </label>
          `).join('')}
        </div>
      </div>

      ${data.overload.hasOverload ? `
        <div class="civictag-section civictag-warning">
          <h4>⚠️ High Traffic Warning</h4>
          ${data.overload.warnings.map(w => `
            <p><small>${w.message}</small></p>
          `).join('')}
        </div>
      ` : ''}

      <div class="civictag-section">
        <h4>Suggested Hashtags <span class="civictag-count">${data.hashtags.length}</span></h4>
        <div class="civictag-hashtags">
          ${data.hashtags.map(tag => `
            <label class="civictag-hashtag-item">
              <input type="checkbox" checked data-hashtag="${tag}" />
              <span>${tag}</span>
            </label>
          `).join('')}
        </div>
      </div>

      <div class="civictag-section">
        <h4>Character Count</h4>
        <p id="civictag-char-count">Calculating...</p>
      </div>

      <div class="civictag-actions">
        <button class="civictag-btn civictag-btn-primary" id="civictag-insert">
          Insert into Tweet ✨
        </button>
        <button class="civictag-btn civictag-btn-secondary" id="civictag-save-draft">
          Save as Draft
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(sidebar);

  // Add event listeners
  document.getElementById('civictag-sidebar-close').addEventListener('click', () => {
    sidebar.remove();
    sidebar = null;
  });

  document.getElementById('civictag-insert').addEventListener('click', () => {
    insertTagsIntoTweet(data);
});

  document.getElementById('civictag-save-draft').addEventListener('click', () => {
    saveDraftComplaint(data);
  });

  if (data.consolidation.shouldConsolidate) {
    document.getElementById('civictag-use-consolidated').addEventListener('click', () => {
      useConsolidatedTemplate(data);
    });
  }

  // Update character count
  updateCharacterCount(data);

  // Add checkbox listeners to update character count
  sidebar.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
    checkbox.addEventListener('change', () => updateCharacterCount(data));
  });
}

/**
 * Update character count
 */
function updateCharacterCount(data) {
  const selectedHandles = Array.from(sidebar.querySelectorAll('input[data-handle]:checked'))
    .map(cb => cb.dataset.handle);
  
  const selectedHashtags = Array.from(sidebar.querySelectorAll('input[data-hashtag]:checked'))
    .map(cb => cb.dataset.hashtag);

  const tagsText = [...selectedHandles, ...selectedHashtags].join(' ');
  const currentText = getTweetText();
  const totalLength = currentText.length + tagsText.length + 2; // +2 for spaces

  const countElement = document.getElementById('civictag-char-count');
  if (countElement) {
    const remaining = 280 - totalLength;
    countElement.textContent = `${totalLength}/280 characters (${remaining} remaining)`;
    countElement.style.color = remaining < 0 ? '#e74c3c' : remaining < 20 ? '#f39c12' : '#27ae60';
  }
}

/**
 * Insert tags into tweet
 */
function insertTagsIntoTweet(data) {
  const selectedHandles = Array.from(sidebar.querySelectorAll('input[data-handle]:checked'))
    .map(cb => cb.dataset.handle);
  
  const selectedHashtags = Array.from(sidebar.querySelectorAll('input[data-hashtag]:checked'))
    .map(cb => cb.dataset.hashtag);

  if (selectedHandles.length === 0) {
    showNotification('Please select at least one authority', 'warning');
    return;
  }

  const tagsText = [...selectedHandles, ...selectedHashtags].join(' ');
  const textbox = document.querySelector('[data-testid="tweetTextarea_0"]') ||
                  document.querySelector('div[contenteditable="true"][role="textbox"]');

  if (textbox) {
    const currentText = textbox.textContent || textbox.innerText || '';
    const newText = `${currentText}\n\n${tagsText}`;

    // Insert text programmatically
    textbox.focus();
    document.execCommand('selectAll', false, null);
    document.execCommand('insertText', false, newText);

    // Record complaint
    recordComplaint(data, selectedHandles, selectedHashtags);

    showNotification('Authorities tagged! Review and post your tweet.', 'success');
    
    if (sidebar) {
      sidebar.remove();
      sidebar = null;
    }
  }
}

/**
 * Record complaint for tracking
 */
async function recordComplaint(data, handles, hashtags) {
  const complaintData = {
    tweetText: getTweetText(),
    category: data.classification.category,
    urgency: data.classification.urgency,
    location: data.location,
    authorities: handles.map(h => ({ handle: h })),
    hashtags: hashtags
  };

  // Save to tracker
  await tracker.saveComplaint(complaintData);

  // Record in spam guard
  await spamGuard.recordComplaint(complaintData);
}

/**
 * Show notification
 */
function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `civictag-notification civictag-notification-${type}`;
  notification.textContent = message;
  
  document.body.appendChild(notification);

  setTimeout(() => {
    notification.style.opacity = '0';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

/**
 * Observe Twitter compose box changes
 */
function observeTwitterCompose() {
  const observer = new MutationObserver((mutations) => {
    const composeBox = findComposeBox();
    if (composeBox && !civicTagButton) {
      injectButton(composeBox);
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}

// Also initialize on navigation (for SPA)
let lastUrl = location.href;
new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    civicTagButton = null;
    setTimeout(injectCivicTagUI, 1000);
  }
}).observe(document, { subtree: true, childList: true });
