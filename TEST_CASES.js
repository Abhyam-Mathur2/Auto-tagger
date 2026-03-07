/**
 * Test Cases for CivicTag v2.0 Upgrade
 * Run these test cases to verify the upgrade is working correctly
 */

const TestCases = {
  
  /**
   * Test Case 1: Hindi water complaint with no location in text
   * Input: "Mere ghar mein 3 din se paani nahi aa raha"
   * Expected: Detect as Water Supply complaint, Hindi language, Medium-High urgency
   */
  test1: async function() {
    const tweet = "Mere ghar mein 3 din se paani nahi aa raha";
    console.log('Test 1: Hindi water complaint');
    console.log('Input:', tweet);
    
    // Would call: const result = await classifier.classify(tweet);
    // Expected: isComplaint: true, department: "Water Supply", urgency: "high", language: "hindi"
  },

  /**
   * Test Case 2: English pothole complaint with location
   * Input: "Huge pothole on MG Road Bangalore causing accidents"
   * Expected: Roads department, Medium urgency, location detected as Bangalore, Karnataka
   */
  test2: async function() {
    const tweet = "Huge pothole on MG Road Bangalore causing accidents";
    console.log('Test 2: English pothole complaint with location');
    console.log('Input:', tweet);
    
    // Expected: isComplaint: true, department: "Roads & Potholes", urgency: "high", language: "english"
    // Location: city: "Bangalore", state: "Karnataka"
  },

  /**
   * Test Case 3: Hinglish power cut complaint
   * Input: "Power cut in Sector 15 Noida since morning, temperatures rising"
   * Expected: Electricity department, High urgency, Hinglish language detected
   */
  test3: async function() {
    const tweet = "Power cut in Sector 15 Noida since morning";
    console.log('Test 3: Hinglish power cut complaint');
    console.log('Input:', tweet);
  },

  /**
   * Test Case 4: Unusual department (stray animals)
   * Input: "Stray dogs attacking children near our school in Andheri West"
   * Expected: Maps to Animal Control department, High urgency
   */
  test4: async function() {
    const tweet = "Stray dogs attacking children near our school in Andheri West";
    console.log('Test 4: Stray animals complaint');
    console.log('Input:', tweet);
    
    // Expected: isComplaint: true, department: "Animal Control", urgency: "high"
    // Location should detect "Andheri West, Mumbai, Maharashtra"
  },

  /**
   * Test Case 5: Building/Construction complaint
   * Input: "Illegal construction happening next to my house in Punjabi Bagh Delhi"
   * Expected: Maps to Building Department, Medium urgency
   */
  test5: async function() {
    const tweet = "Illegal construction happening next to my house in Punjabi Bagh Delhi";
    console.log('Test 5: Illegal construction complaint');
    console.log('Input:', tweet);
    
    // Expected: isComplaint: true, department: "Building Department", urgency: "medium"
    // Location: Punjabi Bagh, Delhi
  },

  /**
   * Verify Groq API Connection
   */
  verifyGroqAPI: async function() {
    const apiKey = 'YOUR_GROQ_API_KEY_HERE'; // User should replace this
    
    if (!apiKey || apiKey === 'YOUR_GROQ_API_KEY_HERE') {
      console.log('❌ Groq API key not configured. Please add your key to run this test.');
      return;
    }

    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant',
          messages: [{ role: 'user', content: 'Say OK' }],
          max_tokens: 10
        })
      });

      if (response.ok) {
        console.log('✅ Groq API connection successful!');
        return true;
      } else {
        console.log('❌ Groq API authentication failed');
        return false;
      }
    } catch (err) {
      console.log('❌ Network error connecting to Groq API:', err.message);
      return false;
    }
  },

  /**
   * Verify LocationDetector works
   */
  verifyLocationDetector: async function() {
    console.log('🧪 Testing LocationDetector...');
    
    // Test 1: Extract from text
    const text = "No water in Ghaziabad since 2 days";
    console.log('Extracting location from:', text);
    const city = LocationDetector.extractLocationKeywords ? 
      LocationDetector.extractLocationKeywords(text) : 
      'Method not found';
    console.log('Extracted location:', city);
  },

  /**
   * Verify AuthorityResolver department normalization
   */
  verifyDepartmentNormalization: async function() {
    console.log('🧪 Testing Department Normalization...');
    
    const resolver = new AuthorityResolver();
    
    const testDepts = [
      { input: 'Water Supply', expectedOutput: 'water' },
      { input: 'Stray Animals', expectedOutput: 'animal_control' },
      { input: 'Illegal Construction', expectedOutput: 'building_dept' },
      { input: 'Power Cut', expectedOutput: 'electricity' },
      { input: 'Pothole', expectedOutput: 'roads' }
    ];

    console.log('Testing normalizeDepartment method:');
    testDepts.forEach(test => {
      const result = resolver.normalizeDepartment(test.input);
      const status = result === test.expectedOutput ? '✅' : '❌';
      console.log(`${status} "${test.input}" -> "${result}" (expected: "${test.expectedOutput}")`);
    });
  }
};

console.log('CivicTag v2.0 Test Suite Loaded');
console.log('Run tests using: TestCases.test1(), TestCases.verifyGroqAPI(), etc.');
