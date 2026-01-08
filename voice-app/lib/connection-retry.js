/**
 * Connection Retry Utility
 * Implements exponential backoff for FreeSWITCH connections
 */

/**
 * Connect with retry logic and exponential backoff
 * @param {Function} connectFn - Function that returns a Promise for the connection
 * @param {Object} options - Retry options
 * @param {number} options.maxRetries - Maximum number of retry attempts (default: 10)
 * @param {Array<number>} options.retryDelays - Array of delay times in ms for each retry
 * @param {string} options.name - Name of the connection (for logging)
 * @returns {Promise} - Resolves with connection object or rejects after max retries
 */
function connectWithRetry(connectFn, options) {
  options = options || {};
  var maxRetries = options.maxRetries || 10;
  var retryDelays = options.retryDelays || [1000, 2000, 3000, 5000, 5000, 5000, 10000, 10000, 10000, 10000];
  var name = options.name || 'Connection';
  var attempt = 0;

  function tryConnect() {
    attempt++;
    var timestamp = new Date().toISOString();
    console.log('[' + timestamp + '] ' + name + ' attempt ' + attempt + '/' + maxRetries);

    return connectFn()
      .then(function(result) {
        var successTimestamp = new Date().toISOString();
        console.log('[' + successTimestamp + '] ' + name + ' established successfully on attempt ' + attempt);
        return result;
      })
      .catch(function(err) {
        if (attempt >= maxRetries) {
          var errorTimestamp = new Date().toISOString();
          console.error('[' + errorTimestamp + '] ' + name + ' failed after ' + maxRetries + ' attempts');
          throw new Error(name + ' failed after ' + maxRetries + ' attempts: ' + err.message);
        }

        var delay = retryDelays[attempt - 1] || retryDelays[retryDelays.length - 1];
        var retryTimestamp = new Date().toISOString();
        console.log('[' + retryTimestamp + '] ' + name + ' failed: ' + err.message);
        console.log('[' + retryTimestamp + '] Retrying in ' + (delay / 1000) + 's... (attempt ' + (attempt + 1) + '/' + maxRetries + ')');

        return new Promise(function(resolve) {
          setTimeout(function() {
            resolve(tryConnect());
          }, delay);
        });
      });
  }

  return tryConnect();
}

module.exports = {
  connectWithRetry: connectWithRetry
};
