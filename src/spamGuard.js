/**
 * spamGuard.js
 * Handles spam prevention, rate limiting, duplicate detection, and complaint consolidation
 */

class SpamGuard {
  constructor() {
    this.rateLimit = 5; // Max complaints per hour
    this.rateLimitWindow = 3600000; // 1 hour in ms
    this.duplicateWindow = 86400000; // 24 hours in ms
    this.consolidationWindow = 21600000; // 6 hours in ms
    this.consolidationThreshold = 10; // Number of users for consolidation
  }

  /**
   * Check if user can post a complaint (rate limiting)
   * @returns {Object} { allowed: boolean, remaining: number, resetTime: timestamp }
   */
  async checkRateLimit() {
    const now = Date.now();
    const result = await chrome.storage.local.get(['complaint_history']);
    const history = result.complaint_history || [];

    // Filter complaints within the rate limit window
    const recentComplaints = history.filter(c => 
      (now - c.timestamp) < this.rateLimitWindow
    );

    const remaining = this.rateLimit - recentComplaints.length;
    const allowed = remaining > 0;

    let resetTime = null;
    if (!allowed && recentComplaints.length > 0) {
      // Find the oldest complaint in the window
      const oldest = recentComplaints.reduce((min, c) => 
        c.timestamp < min.timestamp ? c : min
      );
      resetTime = oldest.timestamp + this.rateLimitWindow;
    }

    return {
      allowed,
      remaining: Math.max(0, remaining),
      resetTime,
      message: allowed 
        ? `You can post ${remaining} more complaint${remaining !== 1 ? 's' : ''} in the next hour.`
        : `Rate limit reached. Try again ${this.formatTimeRemaining(resetTime - now)}.`
    };
  }

  /**
   * Check for duplicate complaints
   * @param {string} issueType - Category of issue
   * @param {Object} location - Location object
   * @returns {Object} { isDuplicate: boolean, originalComplaint: Object }
   */
  async checkDuplicate(issueType, location) {
    if (!issueType || !location || !location.city) {
      return { isDuplicate: false };
    }

    const now = Date.now();
    const result = await chrome.storage.local.get(['complaint_history']);
    const history = result.complaint_history || [];

    // Find similar complaints in the duplicate window
    const similar = history.find(c => {
      const isRecent = (now - c.timestamp) < this.duplicateWindow;
      const sameCategory = c.category === issueType;
      const sameArea = c.location && 
        c.location.city === location.city &&
        (!location.specificArea || c.location.specificArea === location.specificArea);
      
      return isRecent && sameCategory && sameArea;
    });

    if (similar) {
      return {
        isDuplicate: true,
        originalComplaint: similar,
        message: `You already reported a ${issueType} issue in ${location.city} ${this.formatTimeAgo(now - similar.timestamp)} ago.`,
        suggestion: 'Would you like to post a follow-up to escalate this issue?'
      };
    }

    return { isDuplicate: false };
  }

  /**
   * Check if complaint should be consolidated with others
   * @param {string} issueType - Category of issue  
   * @param {Object} location - Location object
   * @returns {Object} Consolidation info
   */
  async checkConsolidation(issueType, location) {
    if (!issueType || !location || !location.city) {
      return { shouldConsolidate: false };
    }

    const now = Date.now();
    
    // Get community complaints from shared storage (simulated with local for now)
    const result = await chrome.storage.local.get(['community_complaints']);
    const communityComplaints = result.community_complaints || [];

    // Find similar complaints from different users in consolidation window
    const similarComplaints = communityComplaints.filter(c => {
      const isRecent = (now - c.timestamp) < this.consolidationWindow;
      const sameCategory = c.category === issueType;
      const sameArea = c.location && 
        c.location.city === location.city &&
        (!location.specificArea || c.location.specificArea === location.specificArea);
      
      return isRecent && sameCategory && sameArea;
    });

    const count = similarComplaints.length;

    if (count >= this.consolidationThreshold) {
      return {
        shouldConsolidate: true,
        count: count + 1, // Include current user
        message: `${count} other residents have reported this ${issueType} issue in ${location.city} in the last 6 hours.`,
        suggestion: 'Post a collective complaint showing community impact?',
        template: this.generateConsolidatedTemplate(issueType, location, count + 1)
      };
    }

    // If close to threshold, notify user
    if (count >= Math.floor(this.consolidationThreshold / 2)) {
      return {
        shouldConsolidate: false,
        nearThreshold: true,
        count: count + 1,
        message: `${count} other residents have also reported this issue recently.`
      };
    }

    return { shouldConsolidate: false, count: 1 };
  }

  /**
   * Check authority overload (shadow ban protection)
   * @param {Array} authorities - List of authority handles to tag
   * @param {string} category - Issue category
   * @returns {Object} Overload warning
   */
  async checkAuthorityOverload(authorities, category) {
    const now = Date.now();
    const result = await chrome.storage.local.get(['authority_tag_counts']);
    const tagCounts = result.authority_tag_counts || {};

    const today = new Date().toDateString();

    const warnings = [];
    for (const authority of authorities) {
      const handle = authority.handle;
      const key = `${handle}_${category}_${today}`;
      const count = tagCounts[key] || 0;

      if (count >= 50) {
        warnings.push({
          handle,
          count,
          message: `${handle} has been tagged ${count}+ times today for ${category} issues. Consider alternative authorities.`
        });
      }
    }

    return {
      hasOverload: warnings.length > 0,
      warnings
    };
  }

  /**
   * Record complaint in history
   * @param {Object} complaint - Complaint data
   */
  async recordComplaint(complaint) {
    const result = await chrome.storage.local.get(['complaint_history']);
    const history = result.complaint_history || [];

    const record = {
      id: this.generateId(),
      timestamp: Date.now(),
      category: complaint.category,
      location: complaint.location,
      authorities: complaint.authorities,
      tweetUrl: complaint.tweetUrl || null,
      status: 'posted'
    };

    history.push(record);

    // Keep only last 100 complaints
    if (history.length > 100) {
      history.splice(0, history.length - 100);
    }

    await chrome.storage.local.set({ complaint_history: history });

    // Also update community complaints (anonymized)
    await this.updateCommunityComplaints(record);

    // Update authority tag counts
    await this.updateAuthorityTagCounts(complaint.authorities, complaint.category);
  }

  /**
   * Update community complaints (for consolidation)
   */
  async updateCommunityComplaints(complaint) {
    const result = await chrome.storage.local.get(['community_complaints']);
    const communityComplaints = result.community_complaints || [];

    // Anonymize complaint
    const anonymized = {
      id: complaint.id,
      timestamp: complaint.timestamp,
      category: complaint.category,
      location: complaint.location,
      // Do not include user-specific data
    };

    communityComplaints.push(anonymized);

    // Clean old entries (older than 7 days)
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    const filtered = communityComplaints.filter(c => c.timestamp > sevenDaysAgo);

    await chrome.storage.local.set({ community_complaints: filtered });
  }

  /**
   * Update authority tag counts
   */
  async updateAuthorityTagCounts(authorities, category) {
    const result = await chrome.storage.local.get(['authority_tag_counts']);
    const tagCounts = result.authority_tag_counts || {};

    const today = new Date().toDateString();

    for (const authority of authorities) {
      const handle = authority.handle;
      const key = `${handle}_${category}_${today}`;
      tagCounts[key] = (tagCounts[key] || 0) + 1;
    }

    // Clean old entries (older than 2 days)
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    const twoDaysAgo = new Date(Date.now() - 172800000).toDateString();
    
    const filtered = {};
    for (const [key, count] of Object.entries(tagCounts)) {
      if (key.includes(today) || key.includes(yesterday)) {
        filtered[key] = count;
      }
    }

    await chrome.storage.local.set({ authority_tag_counts: filtered });
  }

  /**
   * Generate consolidated complaint template
   */
  generateConsolidatedTemplate(issueType, location, count) {
    const templates = {
      water: `URGENT: ${count} residents in ${location.city} reporting NO WATER SUPPLY`,
      electricity: `ALERT: ${count} residents in ${location.city} facing POWER CUT`,
      roads: `${count} residents reporting DANGEROUS ROAD CONDITIONS in ${location.city}`,
      sanitation: `${count} residents reporting GARBAGE/SANITATION issues in ${location.city}`,
      flooding: `EMERGENCY: ${count} residents reporting SEVERE WATERLOGGING in ${location.city}`,
      default: `${count} residents in ${location.city} reporting ${issueType} issues`
    };

    return templates[issueType] || templates.default;
  }

  /**
   * Format time remaining
   */
  formatTimeRemaining(ms) {
    const minutes = Math.ceil(ms / 60000);
    if (minutes < 60) {
      return `in ${minutes} minute${minutes !== 1 ? 's' : ''}`;
    }
    const hours = Math.ceil(minutes / 60);
    return `in ${hours} hour${hours !== 1 ? 's' : ''}`;
  }

  /**
   * Format time ago
   */
  formatTimeAgo(ms) {
    const minutes = Math.floor(ms / 60000);
    if (minutes < 60) {
      return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
    }
    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
      return `${hours} hour${hours !== 1 ? 's' : ''}`;
    }
    const days = Math.floor(hours / 24);
    return `${days} day${days !== 1 ? 's' : ''}`;
  }

  /**
   * Generate unique ID
   */
  generateId() {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get user's complaint statistics
   */
  async getStatistics() {
    const result = await chrome.storage.local.get(['complaint_history']);
    const history = result.complaint_history || [];

    const now = Date.now();
    const last24h = history.filter(c => (now - c.timestamp) < 86400000);
    const last7d = history.filter(c => (now - c.timestamp) < 604800000);
    const last30d = history.filter(c => (now - c.timestamp) < 2592000000);

    return {
      total: history.length,
      last24h: last24h.length,
      last7d: last7d.length,
      last30d: last30d.length,
      byCategory: this.groupByCategory(history),
      recentComplaints: history.slice(-5).reverse()
    };
  }

  /**
   * Group complaints by category
   */
  groupByCategory(complaints) {
    const grouped = {};
    for (const complaint of complaints) {
      const cat = complaint.category || 'other';
      grouped[cat] = (grouped[cat] || 0) + 1;
    }
    return grouped;
  }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SpamGuard;
}
