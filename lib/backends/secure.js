var inherits = require('util').inherits;
var BaseBackend = require('./base');
var _ = require('lodash');
var debug = require('debug')('mongodb-storage-mixin:backends:secure');

/**
 * TODO (@imlucas) COMPASS-3235: Eliminate multiple keychain password requests
 * should be patched in here or just rewrite and delete this entire module.
 */
var keytar = require('keytar');

function SecureBackend(options) {
  if (!(this instanceof SecureBackend)) {
    return new SecureBackend(options);
  }

  options = _.defaults(options, {
    appName: 'storage-mixin'
  });

  this.namespace = options.appName + '/' + options.namespace;
}
inherits(SecureBackend, BaseBackend);

/**
 * Clear the entire namespace. Use with caution!
 *
 * @param {String} namespace
 * @param {Function} done
 */
SecureBackend.clear = function(namespace, done) {
  var serviceName = `storage-mixin/${namespace}`;
  debug('Clearing all secure values for', serviceName);

  keytar
    .findCredentials(serviceName)
    .then(function(accounts) {
      return Promise.all(
        accounts.map(function(entry) {
          var accountName = entry.account;
          return keytar
            .deletePassword(serviceName, accountName)
            .then(function() {
              debug('Deleted account %s successfully', accountName);
              return accountName;
            });
        })
      );
    })
    .then(function(accountNames) {
      debug(
        'Cleared %d accounts for serviceName %s',
        accountNames.length,
        serviceName,
        accountNames
      );
      done();
    })
    .catch(done);
};

/**
 * Remove the passwords properties for a model from the OS keychain.
 *
 * @param {ampersand-model} model
 * @param {Object} options
 * @param {Function} done
 *
 * @see http://ampersandjs.com/docs#ampersand-model-destroy
 */
SecureBackend.prototype.remove = function(model, options, done) {
  var accountName = this._getId(model);
  var serviceName = this.namespace;

  keytar
    .deletePassword(serviceName, accountName)
    .then(function() {
      debug('Removed password for', {
        service: serviceName,
        account: accountName
      });
      done();
    })
    .catch(done);
};

/**
 * Update the passwords properties for a model in the OS keychain.
 *
 * @param {ampersand-model} model
 * @param {Object} options
 * @param {Function} done
 *
 * @see http://ampersandjs.com/docs#ampersand-model-save
 */
SecureBackend.prototype.update = function(model, options, done) {
  var serviceName = this.namespace;
  var accountName = this._getId(model);
  var value = JSON.stringify(this.serialize(model));

  keytar
    .setPassword(serviceName, accountName, value)
    .then(function() {
      debug('Updated password successfully for', {
        service: serviceName,
        account: accountName
      });
      done();
    })
    .catch(function(err) {
      done(err);
    });
};

/**
 * Add the passwords properties for a model in the OS keychain.
 *
 * @param {ampersand-model} model
 * @param {Object} options
 * @param {Function} done
 *
 * @see http://ampersandjs.com/docs#ampersand-model-save
 */
SecureBackend.prototype.create = function(model, options, done) {
  var serviceName = this.namespace;
  var accountName = this._getId(model);
  var value = JSON.stringify(this.serialize(model));

  keytar
    .setPassword(serviceName, accountName, value)
    .then(function() {
      debug('Successfully dreated password for', {
        service: serviceName,
        account: accountName
      });

      done();
    })
    .catch(function(err) {
      done(err);
    });
};

/**
 * Load the passwords properties for a model from the OS keychain.
 *
 * @param {ampersand-model} model
 * @param {Object} options
 * @param {Function} done
 * @return {None}
 *
 * @see http://ampersandjs.com/docs#ampersand-model-fetch
 */
SecureBackend.prototype.findOne = function(model, options, done) {
  var serviceName = this.namespace;
  var accountName = this._getId(model);

  keytar
    .getPassword(serviceName, accountName)
    .then(function(rawJsonString) {
      if (!rawJsonString) {
        debug('findOne failed. No value found', {
          service: serviceName,
          account: accountName
        });

        return done(null, {});
      }
      debug('findOne successful', {
        service: serviceName,
        account: accountName
      });

      done(null, JSON.parse(rawJsonString));
    })
    .catch(done);
};

/**
 * Fetch all keys stored under the active namespace.
 *
 * Note: keytar does not have the ability to return all keys for a given
 * namespace (service). Thus this only works if the collection is
 * pre-populated with stub models that hold their ids already.
 *
 * For merging secure data correctly in the splice backend, we also return
 * the id value again for each object even though that information is not
 * stored as part of the secure data.
 *
 * @param {ampersand-collection} collection
 * @param {Object} options
 * @param {Function} done
 * @return {None}
 *
 * @see http://ampersandjs.com/docs#ampersand-collection-fetch
 */
SecureBackend.prototype.find = function(collection, options, done) {
  debug('Fetching data...', collection.length);
  keytar
    .findCredentials(this.namespace)
    .then(function(credentials) {
      return credentials.map(function(credential) {
        return JSON.parse(credential.password);
      });
    })
    .then(function(contents) {
      var modelStubs = collection.map(function(model) {
        var doc = {};
        doc[model.idAttribute] = model.getId();
        return doc;
      });
      return done(null, _.merge(modelStubs, contents));
    })
    .catch(done);
};

module.exports = SecureBackend;
