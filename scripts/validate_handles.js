/**
 * validate_handles.js
 * Script to validate Twitter handles in the authority database
 * 
 * Usage:
 * 1. Set TWITTER_BEARER_TOKEN environment variable
 * 2. Run: node validate_handles.js
 * 
 * Requirements:
 * - Node.js 14+
 * - Twitter API v2 Bearer Token (free tier)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// Configuration
const BEARER_TOKEN = process.env.TWITTER_BEARER_TOKEN;
const DATABASE_DIR = path.join(__dirname, '..', 'authority_database');
const RATE_LIMIT_DELAY = 1000; // 1 second between requests
const BATCH_SIZE = 100; // Twitter allows 100 users per request

// Stats
const stats = {
  total: 0,
  valid: 0,
  invalid: 0,
  suspended: 0,
  notFound: 0,
  errors: 0
};

const invalidHandles = [];

/**
 * Make Twitter API request
 */
function twitterRequest(endpoint, params = {}) {
  return new Promise((resolve, reject) => {
    if (!BEARER_TOKEN) {
      reject(new Error('TWITTER_BEARER_TOKEN environment variable not set'));
      return;
    }

    const queryString = Object.keys(params)
      .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
      .join('&');

    const url = `https://api.twitter.com/2/${endpoint}${queryString ? '?' + queryString : ''}`;

    const options = {
      headers: {
        'Authorization': `Bearer ${BEARER_TOKEN}`,
        'User-Agent': 'CivicTag-Validator/1.0'
      }
    };

    https.get(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    }).on('error', reject);
  });
}

/**
 * Validate a batch of handles
 */
async function validateHandles(handles) {
  try {
    // Remove @ prefix
    const cleanHandles = handles.map(h => h.replace('@', ''));
    
    const response = await twitterRequest('users/by', {
      usernames: cleanHandles.join(','),
      'user.fields': 'id,username,verified'
    });

    const validHandles = new Set();
    
    if (response.data) {
      response.data.forEach(user => {
        validHandles.add('@' + user.username.toLowerCase());
        stats.valid++;
      });
    }

    // Check for errors (not found, suspended, etc.)
    if (response.errors) {
      response.errors.forEach(error => {
        const handle = '@' + error.value.toLowerCase();
        
        if (error.title === 'Not Found Error') {
          stats.notFound++;
          invalidHandles.push({ handle, reason: 'Not Found' });
        } else if (error.detail.includes('suspended')) {
          stats.suspended++;
          invalidHandles.push({ handle, reason: 'Suspended' });
        } else {
          stats.invalid++;
          invalidHandles.push({ handle, reason: error.detail });
        }
      });
    }

    return validHandles;

  } catch (error) {
    console.error(`Error validating handles:`, error.message);
    stats.errors++;
    return new Set();
  }
}

/**
 * Extract all handles from a database file
 */
function extractHandles(data) {
  const handles = [];
  
  // Handle different structure levels
  const checkObject = (obj) => {
    if (obj.handle) {
      handles.push(obj.handle);
    }
    
    // Check nested objects
    Object.values(obj).forEach(value => {
      if (typeof value === 'object' && value !== null) {
        if (Array.isArray(value)) {
          value.forEach(item => {
            if (typeof item === 'object') {
              checkObject(item);
            }
          });
        } else {
          checkObject(value);
        }
      }
    });
  };

  checkObject(data);
  return handles;
}

/**
 * Process a single database file
 */
async function processFile(filename) {
  const filePath = path.join(DATABASE_DIR, filename);
  
  console.log(`\n📄 Processing ${filename}...`);
  
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(content);
    
    // Extract all handles
    const handles = extractHandles(data);
    console.log(`   Found ${handles.length} handles`);
    
    stats.total += handles.length;

    // Validate in batches
    for (let i = 0; i < handles.length; i += BATCH_SIZE) {
      const batch = handles.slice(i, i + BATCH_SIZE);
      await validateHandles(batch);
      
      // Rate limiting
      if (i + BATCH_SIZE < handles.length) {
        await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
      }
    }

    // Update last_checked timestamp
    const updateTimestamp = (obj) => {
      if (obj.handle) {
        obj.last_checked = new Date().toISOString().split('T')[0];
      }
      
      Object.values(obj).forEach(value => {
        if (typeof value === 'object' && value !== null) {
          if (Array.isArray(value)) {
            value.forEach(item => {
              if (typeof item === 'object') {
                updateTimestamp(item);
              }
            });
          } else {
            updateTimestamp(value);
          }
        }
      });
    };

    updateTimestamp(data);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    console.log(`   ✅ Updated timestamps`);

  } catch (error) {
    console.error(`   ❌ Error processing ${filename}:`, error.message);
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('🇮🇳 CivicTag Authority Handle Validator\n');
  console.log('==========================================\n');

  if (!BEARER_TOKEN) {
    console.error('❌ Error: TWITTER_BEARER_TOKEN environment variable not set');
    console.error('\nPlease set your Twitter API v2 Bearer Token:');
    console.error('   export TWITTER_BEARER_TOKEN="your_token_here"\n');
    process.exit(1);
  }

  try {
    // Get all JSON files in database directory
    const files = fs.readdirSync(DATABASE_DIR)
      .filter(f => f.endsWith('.json') && f !== 'index.json');

    console.log(`Found ${files.length} database files\n`);

    // Process each file
    for (const file of files) {
      await processFile(file);
    }

    // Print summary
    console.log('\n==========================================');
    console.log('📊 VALIDATION SUMMARY\n');
    console.log(`Total Handles Checked: ${stats.total}`);
    console.log(`✅ Valid: ${stats.valid}`);
    console.log(`❌ Invalid: ${stats.invalid}`);
    console.log(`🚫 Not Found: ${stats.notFound}`);
    console.log(`⚠️  Suspended: ${stats.suspended}`);
    console.log(`🔥 Errors: ${stats.errors}`);

    // Print invalid handles
    if (invalidHandles.length > 0) {
      console.log('\n==========================================');
      console.log('⚠️  INVALID HANDLES\n');
      
      invalidHandles.forEach(({ handle, reason }) => {
        console.log(`   ${handle} - ${reason}`);
      });

      // Save to file
      const reportPath = path.join(__dirname, 'invalid_handles_report.json');
      fs.writeFileSync(reportPath, JSON.stringify({
        date: new Date().toISOString(),
        stats,
        invalidHandles
      }, null, 2));
      
      console.log(`\n📝 Full report saved to: ${reportPath}`);
    }

    console.log('\n✅ Validation complete!\n');

  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    process.exit(1);
  }
}

// Run
main();
