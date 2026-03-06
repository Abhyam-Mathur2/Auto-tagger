/**
 * tracker.js
 * Handles complaint tracking, follow-ups, and accountability using IndexedDB
 */

class ComplaintTracker {
  constructor() {
    this.dbName = 'CivicTagDB';
    this.dbVersion = 1;
    this.db = null;
  }

  /**
   * Initialize IndexedDB
   */
  async initialize() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        console.log('CivicTag: Tracker database initialized');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Complaints store
        if (!db.objectStoreNames.contains('complaints')) {
          const complaintsStore = db.createObjectStore('complaints', { keyPath: 'id' });
          complaintsStore.createIndex('timestamp', 'timestamp', { unique: false });
          complaintsStore.createIndex('status', 'status', { unique: false });
          complaintsStore.createIndex('category', 'category', { unique: false });
          complaintsStore.createIndex('state', 'location.state', { unique: false });
        }

        // Responses store (track authority responses)
        if (!db.objectStoreNames.contains('responses')) {
          const responsesStore = db.createObjectStore('responses', { keyPath: 'id', autoIncrement: true });
          responsesStore.createIndex('complaintId', 'complaintId', { unique: false });
          responsesStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
    });
  }

  /**
   * Save a complaint
   * @param {Object} complaint - Complaint data
   */
  async saveComplaint(complaint) {
    if (!this.db) await this.initialize();

    const complaintRecord = {
      id: complaint.id || this.generateId(),
      timestamp: Date.now(),
      tweetText: complaint.tweetText,
      tweetUrl: complaint.tweetUrl,
      category: complaint.category,
      urgency: complaint.urgency,
      location: complaint.location,
      authorities: complaint.authorities,
      hashtags: complaint.hashtags,
      status: 'open',
      responses: [],
      lastChecked: null,
      escalationLevel: 0,
      notes: []
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['complaints'], 'readwrite');
      const store = transaction.objectStore('complaints');
      const request = store.add(complaintRecord);

      request.onsuccess = () => resolve(complaintRecord);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get complaint by ID
   */
  async getComplaint(id) {
    if (!this.db) await this.initialize();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['complaints'], 'readonly');
      const store = transaction.objectStore('complaints');
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get all complaints with optional filters
   */
  async getAllComplaints(filters = {}) {
    if (!this.db) await this.initialize();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['complaints'], 'readonly');
      const store = transaction.objectStore('complaints');
      const request = store.getAll();

      request.onsuccess = () => {
        let complaints = request.result || [];

        // Apply filters
        if (filters.status) {
          complaints = complaints.filter(c => c.status === filters.status);
        }
        if (filters.category) {
          complaints = complaints.filter(c => c.category === filters.category);
        }
        if (filters.state) {
          complaints = complaints.filter(c => c.location && c.location.state === filters.state);
        }

        // Sort by timestamp (newest first)
        complaints.sort((a, b) => b.timestamp - a.timestamp);

        resolve(complaints);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Update complaint status
   */
  async updateComplaintStatus(id, status, note = null) {
    if (!this.db) await this.initialize();

    const complaint = await this.getComplaint(id);
    if (!complaint) {
      throw new Error('Complaint not found');
    }

    complaint.status = status;
    complaint.lastChecked = Date.now();

    if (note) {
      complaint.notes.push({
        timestamp: Date.now(),
        text: note
      });
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['complaints'], 'readwrite');
      const store = transaction.objectStore('complaints');
      const request = store.put(complaint);

      request.onsuccess = () => resolve(complaint);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Record response from authority
   */
  async recordResponse(complaintId, responseData) {
    if (!this.db) await this.initialize();

    const response = {
      complaintId,
      timestamp: Date.now(),
      authorityHandle: responseData.authorityHandle,
      responseText: responseData.responseText,
      responseUrl: responseData.responseUrl
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['responses'], 'readwrite');
      const store = transaction.objectStore('responses');
      const request = store.add(response);

      request.onsuccess = async () => {
        // Update complaint with response
        const complaint = await this.getComplaint(complaintId);
        if (complaint) {
          complaint.responses.push(response);
          complaint.status = 'responded';
          await this.updateComplaintStatus(complaintId, 'responded', 'Authority responded');
        }
        resolve(response);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Check for complaints needing follow-up
   * @returns {Array} Complaints that need action
   */
  async checkFollowUps() {
    const complaints = await this.getAllComplaints({ status: 'open' });
    const now = Date.now();
    const needsFollowUp = [];

    for (const complaint of complaints) {
      const age = now - complaint.timestamp;

      // 48 hours: Check if authority replied
      if (age >= 172800000 && age < 259200000 && complaint.escalationLevel === 0) {
        needsFollowUp.push({
          complaint,
          action: 'check_response',
          message: 'Check if authority has responded',
          suggestedAction: 'Mark as resolved if fixed, or escalate if no response'
        });
      }

      // 72 hours: Escalate to state level
      if (age >= 259200000 && age < 604800000 && complaint.escalationLevel < 1) {
        needsFollowUp.push({
          complaint,
          action: 'escalate_state',
          message: 'No response after 72 hours',
          suggestedAction: 'Escalate to State CM / Minister'
        });
      }

      // 7 days: Escalate to media + portal
      if (age >= 604800000 && complaint.escalationLevel < 2) {
        needsFollowUp.push({
          complaint,
          action: 'escalate_media',
          message: 'Unresolved after 7 days',
          suggestedAction: 'Tag media + file on pgportal.gov.in'
        });
      }
    }

    return needsFollowUp;
  }

  /**
   * Escalate complaint to next level
   */
  async escalateComplaint(id) {
    const complaint = await this.getComplaint(id);
    if (!complaint) {
      throw new Error('Complaint not found');
    }

    complaint.escalationLevel += 1;
    complaint.lastChecked = Date.now();
    complaint.notes.push({
      timestamp: Date.now(),
      text: `Escalated to level ${complaint.escalationLevel}`
    });

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['complaints'], 'readwrite');
      const store = transaction.objectStore('complaints');
      const request = store.put(complaint);

      request.onsuccess = () => resolve(complaint);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get escalation suggestions
   */
  async getEscalationSuggestions(complaint) {
    const suggestions = {
      authorities: [],
      hashtags: [],
      message: ''
    };

    if (complaint.escalationLevel === 0) {
      // First escalation: State level
      suggestions.message = 'Escalate to state authorities';
      suggestions.hashtags = ['#Unresolved', '#NeedAction'];
      // Add state CM (will be done by authorityResolver with escalation flag)
    } else if (complaint.escalationLevel === 1) {
      // Second escalation: Central + Media
      suggestions.message = 'Escalate to central govt and tag media';
      suggestions.authorities = [
        '@PMOIndia',
        '@DARPG_GoI'
      ];
      suggestions.hashtags = ['#UnresolvedComplaint', '#NeedUrgentAction'];
      suggestions.externalActions = [
        {
          name: 'PM Grievance Portal',
          url: 'https://pgportal.gov.in',
          description: 'File official complaint'
        },
        {
          name: 'RTI Request',
          url: 'https://rtionline.gov.in',
          description: 'File RTI for accountability'
        }
      ];
    }

    return suggestions;
  }

  /**
   * Get statistics
   */
  async getStatistics() {
    const allComplaints = await this.getAllComplaints();
    const now = Date.now();

    const stats = {
      total: allComplaints.length,
      open: allComplaints.filter(c => c.status === 'open').length,
      responded: allComplaints.filter(c => c.status === 'responded').length,
      resolved: allComplaints.filter(c => c.status === 'resolved').length,
      byCategory: {},
      responseRate: 0,
      averageResponseTime: 0,
      needsFollowUp: 0
    };

    // Group by category
    for (const complaint of allComplaints) {
      const cat = complaint.category || 'other';
      stats.byCategory[cat] = (stats.byCategory[cat] || 0) + 1;
    }

    // Calculate response rate
    const respondedOrResolved = allComplaints.filter(c => 
      c.status === 'responded' || c.status === 'resolved'
    );
    stats.responseRate = allComplaints.length > 0
      ? Math.round((respondedOrResolved.length / allComplaints.length) * 100)
      : 0;

    // Calculate average response time
    const complaintsWithResponses = allComplaints.filter(c => c.responses.length > 0);
    if (complaintsWithResponses.length > 0) {
      const totalResponseTime = complaintsWithResponses.reduce((sum, c) => {
        const firstResponse = c.responses[0];
        return sum + (firstResponse.timestamp - c.timestamp);
      }, 0);
      stats.averageResponseTime = totalResponseTime / complaintsWithResponses.length;
    }

    // Count complaints needing follow-up
    const followUps = await this.checkFollowUps();
    stats.needsFollowUp = followUps.length;

    return stats;
  }

  /**
   * Export complaints data (for backup)
   */
  async exportData() {
    const complaints = await this.getAllComplaints();
    return JSON.stringify(complaints, null, 2);
  }

  /**
   * Import complaints data (from backup)
   */
  async importData(jsonData) {
    const complaints = JSON.parse(jsonData);
    
    for (const complaint of complaints) {
      await this.saveComplaint(complaint);
    }

    return complaints.length;
  }

  /**
   * Delete complaint
   */
  async deleteComplaint(id) {
    if (!this.db) await this.initialize();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['complaints'], 'readwrite');
      const store = transaction.objectStore('complaints');
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Clear all data
   */
  async clearAllData() {
    if (!this.db) await this.initialize();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['complaints', 'responses'], 'readwrite');
      
      const complaintsStore = transaction.objectStore('complaints');
      const responsesStore = transaction.objectStore('responses');
      
      const req1 = complaintsStore.clear();
      const req2 = responsesStore.clear();

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  /**
   * Generate unique ID
   */
  generateId() {
    return `complaint_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Format time ago
   */
  formatTimeAgo(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    
    const minutes = Math.floor(diff / 60000);
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
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ComplaintTracker;
}
