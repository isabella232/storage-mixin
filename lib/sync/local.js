var inherits = require('util').inherits;
var format = require('util').format;
var localforage = require('localforage');
var BaseLayer = require('./base');
var _ = require('lodash');
var async = require('async');
var debug = require('debug')('storage-mixin:sync:local');


/**
 * Persist insecure data to disk using `localforage`,
 * a wrapper for localstorage, IndexedDB, or WebSQL.
 *
 * @param {String} namespace
 * @class {LocalLayer}
 * @implements {Base}
 *
 * @example
 *   var Pet = AmpersandModel.extend({
 *     idAttribute: 'name',
 *     props: {
 *       name: 'string',
 *       type: 'string'
 *     },
 *     sync: require('./sync/local')('org.company.pets')
 *   });
 *
 *   var PetCollection = AmpersandCollection.extend({
 *     model: Pet,
 *     sync: require('./sync/local')('org.company.pets')
 *   });
 *
 *   // Persist 3 pets
 *   new Pet({name: 'arlo', type: 'dog'}).save();
 *   new Pet({name: 'basil type: 'cat'}).save();
 *   new Pet({name: 'kochka type: 'seabeast'}).save();
 *
 *   // Now we can fetch them all back later
 *   var pets = new PetCollection();
 *   pets.on('sync', function(){
 *     console.log('Loaded %d pets!', pets.length);
 *   });
 *   pets.fetch();
 */
function LocalLayer(namespace) {
  if (!(this instanceof LocalLayer)) {
    return new LocalLayer(namespace);
  }
  this.namespace = namespace;

  // configure localforage
  localforage.config({
    // driver: localforage.INDEXEDDB,
    driver: localforage.LOCALSTORAGE,
    name: 'storage-mixin',
    storeName: namespace
  });
}
inherits(LocalLayer, BaseLayer);

/**
 * Exclude property names that contain `password`
 * because we don't want to store passwords in
 * plaintext.
 *
 * @param {ampersand-model} model
 * @return {Object}
 */
// LocalLayer.prototype.serialize = function(model) {
//   return _.omit(model.serialize({
//     all: true
//   }), function(val, key) {
//     return (/password/).test(key);
//   });
// };

/**
 * Get the primary key `model` is stored under.
 *
 * @param {ampersand-model} model
 * @return {Any}
 *
 * @api private
 */
LocalLayer.prototype._key = function(model) {
  return model.getId();
};

/**
 * The `localforage` API doesn't support atomic updates
 * so `update` and `create` are the same under the hood.
 *
 * @param {ampersand-model} model
 * @param {Object} options
 * @param {Function} done
 * @api private
 */
LocalLayer.prototype._write = function(model, options, done) {
  localforage.setItem(this._key(model), model.serialize(), done);
};

/**
 * Load a model with `localforage`.
 *
 * @param {ampersand-model} model
 * @param {Object} options
 * @param {Function} done
 *
 * @see http://ampersandjs.com/docs#ampersand-model-fetch
 */
LocalLayer.prototype.findOne = function(model, options, done) {
  localforage.getItem(this._key(model), done);
};

/**
 * Delete a model via `localforage`.
 *
 * @param {ampersand-model} model
 * @param {Object} options
 * @param {Function} done
 *
 * @see http://ampersandjs.com/docs#ampersand-model-destroy
 */
LocalLayer.prototype.remove = function(model, options, done) {
  localforage.removeItem(this._key(model), done);
};

/**
 * Point `update` interface method at our `_write` method.
 */
LocalLayer.prototype.update = LocalLayer.prototype._write;

/**
 * Point `create` interface method at our `_write` method.
 */
LocalLayer.prototype.create = LocalLayer.prototype._write;

/**
 * Fetch all keys stored under the active namespace.
 *
 * @param {ampersand-collection} collection
 * @param {Object} options
 * @param {Function} done
 *
 * @see http://ampersandjs.com/docs#ampersand-collection-fetch
 */
LocalLayer.prototype.find = function(collection, options, done) {
  var prefix = format('%s/', this.namespace);
  localforage.keys(function(err, keys) {
    if (err) {
      debug('error fetching keys for prefix `%s`:',
        prefix, err);
      return done(err);
    }

    if (keys.length === 0) {
      debug('no keys stored');
      return done(null, []);
    }
    options.ids = [];
    var tasks = _.chain(keys)
      .filter(function(key) {
        return _.startsWith(key, prefix);
      })
      // .each(function(key) {
      //   // this is for the keychain store which doesn't support a find() and needs a list of ids
      //   options.ids.push(key.split('/')[1]);
      // })
      .map(function(key) {
        return localforage.getItem.bind(localforage, key);
      })
      .value();

    if (tasks.length === 0) {
      debug('no keys found for prefix `%s`', prefix);
      return done(null, []);
    }
    debug('fetching `%d` keys...', tasks.length);
    async.parallel(tasks, done);
  });
};

module.exports = LocalLayer;
