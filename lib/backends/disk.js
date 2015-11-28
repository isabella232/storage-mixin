var inherits = require('util').inherits;
var BaseBackend = require('./base');
var fs = require('fs');
var path = require('path');
var async = require('async');

var debug = require('debug')('storage-mixin:sync:disk');


function DiskBackend(namespace, storePath) {
  storePath = storePath || '.';
  if (!(this instanceof DiskBackend)) {
    return new DiskBackend(namespace);
  }
  this.namespace = namespace;
  this.path = path.join(storePath, namespace);
  // create path synchronously so we can use the model right away
  try {
    /* eslint no-sync: 0 */
    fs.mkdirSync(this.path);
  } catch (e) {
    if (e.code !== 'EEXIST') {
      throw e;
    }
  }
}
inherits(DiskBackend, BaseBackend);


DiskBackend.prototype._getFilePath = function(model) {
  var id = (typeof model === 'string') ? model : model.getId();
  return path.join(this.path, id + '.json');
};

/**
 * The `disk` layer doesn't support atomic updates
 * so `update` and `create` are the same under the hood.
 *
 * @param {ampersand-model} model
 * @param {Object} options
 * @param {Function} done
 * @api private
 */
DiskBackend.prototype._write = function(model, options, done) {
  var file = this._getFilePath(model);
  fs.writeFile(file, JSON.stringify(model.serialize()), 'utf8', done);
};

/**
 * Delete a model on disk.
 *
 * @param {ampersand-model} model
 * @param {Object} options
 * @param {Function} done
 *
 * @see http://ampersandjs.com/docs#ampersand-model-destroy
 */
DiskBackend.prototype.remove = function(model, options, done) {
  var file = this._getFilePath(model);
  fs.exists(file, function(exists) {
    if (!exists) {
      return done({});
    }
    fs.unlink(file, done);
  });
};

/**
 * Point `update` interface method at our `_write` method.
 */
DiskBackend.prototype.update = DiskBackend.prototype._write;

/**
 * Point `create` interface method at our `_write` method.
 */
DiskBackend.prototype.create = DiskBackend.prototype._write;

/**
 * Load a model from disk.
 *
 * @param {ampersand-model} model
 * @param {Object} options
 * @param {Function} done
 *
 * @see http://ampersandjs.com/docs#ampersand-model-fetch
 */
DiskBackend.prototype.findOne = function(model, options, done) {
  var file = this._getFilePath(model);
  fs.exists(file, function(exists) {
    if (!exists) {
      return done(null, {});
    }
    fs.readFile(file, 'utf8', function(err, content) {
      if (err) {
        return done(err);
      }
      done(null, JSON.parse(content));
    });
  });
};

/**
 * Fetch all keys stored under the active namespace.
 *
 * @param {ampersand-collection} collection
 * @param {Object} options
 * @param {Function} done
 *
 * @see http://ampersandjs.com/docs#ampersand-collection-fetch
 */
DiskBackend.prototype.find = function(collection, options, done) {
  fs.readdir(this.path, function(err, files) {
    if (err) {
      return done(err);
    }
    var tasks = files.map(function(file) {
      return this.findOne.bind(this, file);
    });
    if (tasks.length === 0) {
      debug('no keys found for namespace `%s`', this.namespace);
      return done(null, []);
    }
    debug('fetching %d models', tasks.length);
    async.parallel(tasks, done);
  });
};

module.exports = DiskBackend;