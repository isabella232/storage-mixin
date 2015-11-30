/**
 * Helper so you can just use errbacks `function(err, res)`
 * when calling ampersand sync methods instead of forgetting
 * to always check for the oddities of the sync api.
 *
 * @param {String} method
 * @param {Object} model
 * @param {Object} options
 * @return {Function}
 */
function wrapOptions(method, model, options) {
  return function(err, res) {
    if (options.success) {
      options.success(res);
    } else if (options.error) {
      options.error(err);
    }
  };
}

/**
 * The opposite of wrapOptions, this helper wraps an errback
 * and returns an options object that calls the errback appropriately.
 *
 * @param {Function} done
 * @return {Object}
 */
var wrapErrback = function(done) {
  return {
    success: function(res) {
      done(null, res);
    },
    error: function(res, err) {
      done(err);
    }
  };
};

module.exports.wrapOptions = wrapOptions;
module.exports.wrapErrback = wrapErrback;
