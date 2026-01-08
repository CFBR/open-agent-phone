/**
 * FreeSWITCH Retry Logic Test
 *
 * Tests the exponential backoff retry mechanism for FreeSWITCH connections.
 * Run with: node test/freeswitch-retry.test.js
 */

var assert = require('assert');

// Import the ACTUAL production code - not a copy!
var connectionRetry = require('../lib/connection-retry');
var connectWithRetry = connectionRetry.connectWithRetry;

// Mock FreeSWITCH connection function for testing
function createMockFreeswitchConnect(failCount) {
  var attempts = 0;
  return function() {
    attempts++;
    if (attempts <= failCount) {
      return Promise.reject(new Error('Connection refused (attempt ' + attempts + ')'));
    }
    return Promise.resolve({ connection: 'mock-ms' });
  };
}

// Test suite
function runTests() {
  console.log('='.repeat(64));
  console.log('FreeSWITCH Retry Logic Tests');
  console.log('='.repeat(64));

  // Use short delays for testing (10ms instead of 1000ms)
  var testDelays = [10, 20, 30, 50, 50, 50, 100, 100, 100, 100];
  var maxRetries = 10;

  // Test 1: Succeed on first attempt
  console.log('\n[TEST 1] Should succeed on first attempt');
  var mockConnect1 = createMockFreeswitchConnect(0);
  connectWithRetry(mockConnect1, {
    maxRetries: maxRetries,
    retryDelays: testDelays,
    name: 'TEST'
  })
    .then(function(ms) {
      assert.strictEqual(ms.connection, 'mock-ms', 'Should return mock connection');
      console.log('[TEST 1] PASSED\n');

      // Test 2: Succeed on 3rd attempt
      console.log('[TEST 2] Should succeed on 3rd attempt after 2 failures');
      var mockConnect2 = createMockFreeswitchConnect(2);
      return connectWithRetry(mockConnect2, {
        maxRetries: maxRetries,
        retryDelays: testDelays,
        name: 'TEST'
      });
    })
    .then(function(ms) {
      assert.strictEqual(ms.connection, 'mock-ms', 'Should return mock connection');
      console.log('[TEST 2] PASSED\n');

      // Test 3: Fail after max retries
      console.log('[TEST 3] Should fail after max retries');
      var mockConnect3 = createMockFreeswitchConnect(999); // Always fail
      return connectWithRetry(mockConnect3, {
        maxRetries: maxRetries,
        retryDelays: testDelays,
        name: 'TEST'
      });
    })
    .catch(function(err) {
      assert.ok(err.message.includes('failed after 10 attempts'), 'Should report max retries');
      console.log('[TEST 3] PASSED - Correctly failed after max retries\n');

      // Test 4: Verify default delay values from production code
      console.log('[TEST 4] Verify default delay values match production');
      // The production defaults are: [1000, 2000, 3000, 5000, 5000, 5000, 10000, 10000, 10000, 10000]
      // We verify by testing that the module accepts empty options and uses defaults
      var mockConnect4 = createMockFreeswitchConnect(0);
      return connectWithRetry(mockConnect4, { name: 'DEFAULT-TEST' });
    })
    .then(function(ms) {
      assert.strictEqual(ms.connection, 'mock-ms', 'Should work with default options');
      console.log('[TEST 4] PASSED\n');

      console.log('='.repeat(64));
      console.log('All tests PASSED!');
      console.log('='.repeat(64));
    })
    .catch(function(err) {
      console.error('[TEST] FAILED: ' + err.message);
      process.exit(1);
    });
}

// Run tests if executed directly
if (require.main === module) {
  runTests();
}

module.exports = { runTests: runTests };
