var _ = require('lodash');
var async = require('async');
var BaseBackend = require('./base');
var LocalBackend = require('./local');
var SecureBackend = require('./secure');
var wrapOptions = require('./errback').wrapOptions;
var wrapErrback = require('./errback').wrapErrback;
var inherits = require('util').inherits;

// var debug = require('debug')('storage-mixin:backends:splice');

function SpliceBackend(options) {
  if (!(this instanceof SpliceBackend)) {
    return new SpliceBackend(options);
  }

  options = _.defaults(options, {
    appName: 'storage-mixin',
    secureCondition: function(val, key) {
      return key.match(/password/);
    }
  });

  this.namespace = options.namespace;

  // patch the serialize methods in both backends
  var condition = options.secureCondition;
  LocalBackend.prototype.serialize = function(model) {
    var res = _.omit(model.serialize(), condition);
    return res;
  };
  this.localBackend = new LocalBackend(options);

  SecureBackend.prototype.serialize = function(model) {
    var res = _.pick(model.serialize(), condition);
    return res;
  };
  this.secureBackend = new SecureBackend(options);
}

inherits(SpliceBackend, BaseBackend);

/**
 * Clear the entire namespace. Use with caution!
 *
 * @param {String} namespace
 * @param {Function} done
 */
SpliceBackend.clear = function(namespace, done) {
  // call clear for all involved backends
  var tasks = [
    LocalBackend.clear.bind(null, namespace),
    SecureBackend.clear.bind(null, namespace)  // note: this is a no-op
  ];
  async.parallel(tasks, done);
};

SpliceBackend.prototype.exec = function(method, model, options, done) {
  var self = this;
  done = done || wrapOptions(method, model, options);

  var tasks = [
    function(cb) {
      self.localBackend.exec(method, model, wrapErrback(cb));
    },
    function(localRes, cb) {
      // after receiving the result from `local`, we set it on the the
      // model/collection here so that `secure` knows the ids.
      model.set(localRes, {silent: true});
      self.secureBackend.exec(method, model, wrapErrback(function(err, res) {
        if (err) {
          return cb(err);
        }
        // once `secure` returned its result, we merge it with `local`'s result
        cb(null, _.merge(localRes, res));
      }));
    }
  ];
  async.waterfall(tasks, done);
};

module.exports = SpliceBackend;
