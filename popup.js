/**
 * popup.js
 * Dashboard functionality for CivicTag popup
 */

let tracker;
let locationDetector;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  // Initialize tracker
  tracker = new ComplaintTracker();
  await tracker.initialize();

  // Initialize location detector for state list
  locationDetector = new LocationDetector();
  await locationDetector.initialize();

  // Load data
  await loadDashboard();
  await loadComplaints();
  await loadSettings();

  // Set up event listeners
  setupEventListeners();
});

/**
 * Set up all event listeners
 */
function setupEventListeners() {
  // Tab switching
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.dataset.tab;
      switchTab(tabName);
    });
  });

  // Dashboard actions
  document.getElementById('open-twitter').addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://twitter.com' });
  });

  document.getElementById('refresh-data').addEventListener('click', async () => {
    await loadDashboard();
    await loadComplaints();
    showNotification('Data refreshed', 'success');
  });

  // Settings actions
  document.getElementById('save-api-key').addEventListener('click', saveApiKey);
  document.getElementById('save-location').addEventListener('click', saveLocation);
  document.getElementById('export-data').addEventListener('click', exportData);
  document.getElementById('clear-data').addEventListener('click', clearData);

  // State dropdown change
  document.getElementById('default-state').addEventListener('change', (e) => {
    updateCityOptions(e.target.value);
  });
}

/**
 * Switch tabs
 */
function switchTab(tabName) {
  // Update tab buttons
  document.querySelectorAll('.tab').forEach(tab => {
    tab.classList.remove('active');
    if (tab.dataset.tab === tabName) {
      tab.classList.add('active');
    }
  });

  // Update tab content
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.remove('active');
  });
  document.getElementById(`${tabName}-tab`).classList.add('active');

  // Load tab-specific data
  if (tabName === 'complaints') {
    loadComplaints();
  } else if (tabName === 'dashboard') {
    loadDashboard();
  }
}

/**
 * Load dashboard data
 */
async function loadDashboard() {
  try {
    const stats = await tracker.getStatistics();

    // Update stats
    document.getElementById('stat-total').textContent = stats.total;
    document.getElementById('stat-open').textContent = stats.open;
    document.getElementById('stat-resolved').textContent = stats.resolved;
    document.getElementById('stat-rate').textContent = `${stats.responseRate}%`;

    // Check for follow-ups
    const followUps = await tracker.checkFollowUps();
    
    if (followUps.length > 0) {
      const followUpSection = document.getElementById('follow-up-section');
      followUpSection.innerHTML = `
        <div class="notification warning">
          <strong>⏰ ${followUps.length} complaint${followUps.length !== 1 ? 's' : ''} need${followUps.length === 1 ? 's' : ''} follow-up!</strong><br>
          <small>Check the Complaints tab for details</small>
        </div>
      `;
    }

  } catch (error) {
    console.error('Error loading dashboard:', error);
  }
}

/**
 * Load complaints list
 */
async function loadComplaints() {
  try {
    const complaints = await tracker.getAllComplaints();
    const complaintList = document.getElementById('complaint-list');

    if (complaints.length === 0) {
      complaintList.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📝</div>
          <p>No complaints yet.</p>
          <p><small>Start tagging authorities on Twitter/X!</small></p>
        </div>
      `;
      return;
    }

    complaintList.innerHTML = complaints.map(complaint => {
      const timeDiff = Date.now() - complaint.timestamp;
      const timeAgo = formatTimeAgo(timeDiff);

      return `
        <div class="complaint-item ${complaint.status}" onclick="viewComplaint('${complaint.id}')">
          <div class="complaint-header">
            <span class="complaint-category">${complaint.category}</span>
            <span class="complaint-time">${timeAgo}</span>
          </div>
          <div class="complaint-text">${complaint.tweetText}</div>
          <div>
            <span class="complaint-status status-${complaint.status}">${complaint.status.toUpperCase()}</span>
          </div>
        </div>
      `;
    }).join('');

  } catch (error) {
    console.error('Error loading complaints:', error);
  }
}

/**
 * Load settings
 */
async function loadSettings() {
  // Load API key (don't show it)
  const result = await chrome.storage.local.get(['gemini_api_key', 'saved_location']);
  
  if (result.gemini_api_key) {
    document.getElementById('api-key').placeholder = '••••••••••••••••';
  }

  // Load saved location
  if (result.saved_location) {
    const loc = result.saved_location;
    if (loc.state) {
      document.getElementById('default-state').value = loc.state;
      updateCityOptions(loc.state);
    }
    if (loc.city) {
      document.getElementById('default-city').value = loc.city;
    }
  }

  // Populate states dropdown
  const states = locationDetector.getAllStates();
  const stateSelect = document.getElementById('default-state');
  states.forEach(state => {
    const option = document.createElement('option');
    option.value = state;
    option.textContent = state;
    stateSelect.appendChild(option);
  });
}

/**
 * Update city options based on selected state
 */
function updateCityOptions(state) {
  if (!state) return;

  const cities = locationDetector.getCitiesForState(state);
  const cityInput = document.getElementById('default-city');
  
  if (cities.length > 0) {
    // Could add datalist here for autocomplete
    cityInput.placeholder = `e.g., ${cities[0]}, ${cities[1] || cities[0]}`;
  }
}

/**
 * Save API key
 */
async function saveApiKey() {
  const apiKey = document.getElementById('api-key').value.trim();
  
  if (!apiKey) {
    showNotification('Please enter an API key', 'warning');
    return;
  }

  try {
    await chrome.storage.local.set({ gemini_api_key: apiKey });
    document.getElementById('api-key').value = '';
    document.getElementById('api-key').placeholder = '••••••••••••••••';
    showNotification('API key saved successfully!', 'success');
  } catch (error) {
    showNotification('Error saving API key', 'error');
  }
}

/**
 * Save location
 */
async function saveLocation() {
  const state = document.getElementById('default-state').value;
  const city = document.getElementById('default-city').value.trim();

  if (!state || !city) {
    showNotification('Please select state and enter city', 'warning');
    return;
  }

  try {
    const location = {
      state,
      city,
      district: null,
      zone: null,
      source: 'user_settings'
    };

    await chrome.storage.local.set({ saved_location: location });
    showNotification('Default location saved!', 'success');
  } catch (error) {
    showNotification('Error saving location', 'error');
  }
}

/**
 * Export data
 */
async function exportData() {
  try {
    const data = await tracker.exportData();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `civictag-complaints-${Date.now()}.json`;
    a.click();
    
    URL.revokeObjectURL(url);
    showNotification('Data exported successfully!', 'success');
  } catch (error) {
    showNotification('Error exporting data', 'error');
  }
}

/**
 * Clear all data
 */
async function clearData() {
  if (!confirm('Are you sure you want to delete all complaint data? This cannot be undone.')) {
    return;
  }

  try {
    await tracker.clearAllData();
    await chrome.storage.local.remove(['complaint_history', 'community_complaints', 'authority_tag_counts']);
    
    showNotification('All data cleared', 'success');
    await loadDashboard();
    await loadComplaints();
  } catch (error) {
    showNotification('Error clearing data', 'error');
  }
}

/**
 * View complaint details
 */
async function viewComplaint(complaintId) {
  try {
    const complaint = await tracker.getComplaint(complaintId);
    
    if (!complaint) {
      showNotification('Complaint not found', 'error');
      return;
    }

    // Show complaint details in a modal-like view
    const detailsHtml = `
      <div style="padding: 20px;">
        <h3 style="margin-bottom: 12px;">Complaint Details</h3>
        
        <p style="margin-bottom: 8px;"><strong>Category:</strong> ${complaint.category}</p>
        <p style="margin-bottom: 8px;"><strong>Status:</strong> 
          <span class="complaint-status status-${complaint.status}">${complaint.status.toUpperCase()}</span>
        </p>
        <p style="margin-bottom: 8px;"><strong>Location:</strong> 
          ${complaint.location.city || 'Unknown'}, ${complaint.location.state || 'Unknown'}
        </p>
        <p style="margin-bottom: 8px;"><strong>Filed:</strong> ${new Date(complaint.timestamp).toLocaleString()}</p>
        
        <p style="margin: 16px 0 8px 0;"><strong>Complaint Text:</strong></p>
        <p style="background: #f7f9f9; padding: 12px; border-radius: 8px; line-height: 1.4;">
          ${complaint.tweetText}
        </p>

        ${complaint.tweetUrl ? `
          <p style="margin-top: 12px;">
            <a href="${complaint.tweetUrl}" target="_blank" class="btn btn-secondary" style="display: inline-block;">
              View Tweet
            </a>
          </p>
        ` : ''}

        <div style="margin-top: 20px; display: flex; gap: 8px;">
          <button class="btn btn-primary" onclick="markResolved('${complaint.id}')">Mark Resolved</button>
          <button class="btn btn-secondary" onclick="escalate('${complaint.id}')">Escalate</button>
          <button class="btn btn-secondary" onclick="closeDetails()">Close</button>
        </div>
      </div>
    `;

    // Replace complaints list with details
    document.getElementById('complaint-list').innerHTML = detailsHtml;

  } catch (error) {
    console.error('Error viewing complaint:', error);
    showNotification('Error loading complaint details', 'error');
  }
}

/**
 * Mark complaint as resolved
 */
async function markResolved(complaintId) {
  try {
    await tracker.updateComplaintStatus(complaintId, 'resolved', 'Marked as resolved by user');
    showNotification('Complaint marked as resolved', 'success');
    closeDetails();
    await loadDashboard();
    await loadComplaints();
  } catch (error) {
    showNotification('Error updating complaint', 'error');
  }
}

/**
 * Escalate complaint
 */
async function escalate(complaintId) {
  try {
    const complaint = await tracker.escalateComplaint(complaintId);
    const suggestions = await tracker.getEscalationSuggestions(complaint);
    
    showNotification(`Escalated to level ${complaint.escalationLevel}. ${suggestions.message}`, 'info');
    
    // Could open Twitter with escalation template here
    if (suggestions.authorities && suggestions.authorities.length > 0) {
      const escalationText = `ESCALATION: ${complaint.tweetText} ${suggestions.authorities.join(' ')} ${suggestions.hashtags.join(' ')}`;
      const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(escalationText)}`;
      chrome.tabs.create({ url: twitterUrl });
    }
    
    closeDetails();
    await loadComplaints();
  } catch (error) {
    showNotification('Error escalating complaint', 'error');
  }
}

/**
 * Close details view
 */
function closeDetails() {
  loadComplaints();
}

/**
 * Show notification
 */
function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.textContent = message;
  notification.style.position = 'fixed';
  notification.style.top = '20px';
  notification.style.left = '50%';
  notification.style.transform = 'translateX(-50%)';
  notification.style.zIndex = '10000';
  notification.style.minWidth = '200px';
  notification.style.maxWidth = '90%';
  
  document.body.appendChild(notification);

  setTimeout(() => {
    notification.style.opacity = '0';
    notification.style.transition = 'opacity 0.3s';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

/**
 * Format time ago
 */
function formatTimeAgo(ms) {
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;
  
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

// Make functions available globally for onclick handlers
window.viewComplaint = viewComplaint;
window.markResolved = markResolved;
window.escalate = escalate;
window.closeDetails = closeDetails;
