var util = require('../util');
var Model = require('./Model');
var Query = require('./Query');

Model.INITS.push(function(model, options) {
  model.root.fetchOnly = options.fetchOnly;

  // Maps doc path to doc version
  model.root._loadVersions = new LoadVersions();
});

function LoadVersions() {}

Model.prototype.fetch = function() {
  this._forSubscribable(arguments, 'fetch');
  return this;
};

Model.prototype.unfetch = function() {
  this._forSubscribable(arguments, 'unfetch');
  return this;
};

Model.prototype.subscribe = function() {
  this._forSubscribable(arguments, 'subscribe');
  return this;
};

Model.prototype.unsubscribe = function() {
  this._forSubscribable(arguments, 'unsubscribe');
  return this;
};

Model.prototype._forSubscribable = function(argumentsObject, method) {
  var args, cb;
  if (!argumentsObject.length) {
    // Use this model's scope if no arguments
    args = [null];
  } else if (typeof argumentsObject[0] === 'function') {
    // Use this model's scope if the first argument is a callback
    args = [null];
    cb = argumentsObject[0];
  } else if (Array.isArray(argumentsObject[0])) {
    // Items can be passed in as an array
    args = argumentsObject[0];
    cb = argumentsObject[1];
  } else {
    // Or as multiple arguments
    args = Array.prototype.slice.call(argumentsObject);
    var last = args[args.length - 1];
    if (typeof last === 'function') cb = args.pop();
  }

  var group = util.asyncGroup(this.wrapCallback(cb));
  var finished = group();
  var docMethod = method + 'Doc';

  for (var i = 0; i < args.length; i++) {
    var item = args[i];
    if (item instanceof Query) {
      item[method](group());
    } else {
      var segments = this._dereference(this._splitPath(item));
      if (segments.length === 2) {
        // Do the appropriate method for a single document.
        this[docMethod](segments[0], segments[1], group(), item && item._persistent);
      } else if (segments.length === 1) {
        // Make a query to an entire collection.
        var query = this.query(segments[0], {});
        query[method](group());
      } else if (segments.length === 0) {
        group()(new Error('No path specified for ' + method));
      } else {
        group()(new Error('Cannot ' + method + ' to a path within a document: ' +
          segments.join('.')));
      }
    }
  }
  process.nextTick(finished);
};

/**
 * @param {String}
 * @param {String} id
 * @param {Function} cb(err)
 * @param {Boolean} alreadyLoaded
 */
Model.prototype.fetchDoc = function(collectionName, id, cb, alreadyLoaded) {
  cb = this.wrapCallback(cb);

  // Maintain a count of fetches so that we can unload the document when
  // there are no remaining fetches or subscribes for that document
  var path = collectionName + '.' + id;
  this._context.fetchDoc(path, this._pass);

  var model = this;
  var doc = this.getOrCreateDoc(collectionName, id);
  if (alreadyLoaded) {
    fetchDocCallback();
  } else {
    doc.shareDoc.fetch(fetchDocCallback);
  }
  function fetchDocCallback(err) {
    if (err) return cb(err);
    if (doc.shareDoc.version !== model.root._loadVersions[path]) {
      model.root._loadVersions[path] = doc.shareDoc.version;
      doc._updateCollectionData();
      model.emit('load', [collectionName, id], [doc.get(), model._pass]);
    }
    cb();
  }
};

/**
 * @param {String} collectionName
 * @param {String} id of the document we want to subscribe to
 * @param {Function} cb(err)
 */
Model.prototype.subscribeDoc = function(collectionName, id, cb, persistent) {
  var path = collectionName + '.' + id,
      model = this,
      doc = this.getOrCreateDoc(collectionName, id);

  // console.log('Model.prototype.subscribeDoc', doc);
  cb = this.wrapCallback(cb);
  var count = this._context.subscribedCount(path, this._pass);
  // console.log('Model.prototype.subscribeDoc', collectionName, id, count, 'persistent '+persistent);

  if (persistent) {
    doc._persistent = true;

    if (count) {
      return cb();
    }
  }

  this._context.subscribeDoc(path, this._pass);

  if (count) {
    return cb();
  }

  if (this.root.fetchOnly) {
    // Only fetch if the document isn't already loaded
    if (doc.get() === void 0) {
      doc.shareDoc.fetch(subscribeDocCallback);
    } else {
      subscribeDocCallback();
    }
  } else {
    doc.shareDoc.subscribe(subscribeDocCallback);

    doc.shareDoc.on('unsubscribe', function(data) {
      model._maybeUnloadDoc(data.c, data.id);
    });
  }

  function subscribeDocCallback(err) {
    if (err) return cb(err);
    if (!doc.createdLocally && doc.shareDoc.version !== model.root._loadVersions[path]) {
      model.root._loadVersions[path] = doc.shareDoc.version;
      doc._updateCollectionData();

      if (doc.shareDoc.bs) {
        model.silent().emit('load', [collectionName, id], [doc.get(), model._pass]);
      }
      else {
        model.emit('load', [collectionName, id], [doc.get(), model._pass]);
      }
    }
    cb();
  }
};

Model.prototype.unfetchDoc = function(collectionName, id, cb) {
  cb = this.wrapCallback(cb);
  var path = collectionName + '.' + id;

  this._context.unfetchDoc(path, this._pass);
  this._maybeUnloadDoc(collectionName, id);
  cb(null, 0);
};

Model.prototype.unsubscribeDoc = function(collectionName, id, cb, followPersistency) {
  // console.trace('** Model.prototype.unsubscribeDoc ('+collectionName+')', this.root && this.root.collections && this.root.collections.auths && this.root.collections.auths.docs);
  var model = this,
      doc = this.getDoc(collectionName, id),
      shareDoc = model.root.shareConnection.get(collectionName, id),
      path = collectionName + '.' + id;

  cb = this.wrapCallback(cb);

  // console.log('Model.prototype.unsubscribeDoc', collectionName, id, doc, doc && doc._persistent);
  // console.log('persistency', followPersistency, doc && doc._persistent);

  if ((followPersistency && doc && doc._persistent) || this._context.unsubscribeDoc(path, this._pass)) {
    return cb();
  }

  if (model.root.fetchOnly) {
    unsubscribeDocCallback();
  } else {
    if (!shareDoc) {
      return cb(new Error('Share document not found for: ' + path));
    }

    shareDoc.unsubscribe(unsubscribeDocCallback);
  }

  function unsubscribeDocCallback(err) {
    if (err) return cb(err);
    cb(null, 0);
  }
};

Model.prototype.bulkUnsubscribeDocs = function(docs, cb) {
  var model = this,
      doc, path, docs2 = [];

  for (var i = 0; i < docs.length; i++) {
    doc = docs[i];
    path = doc.c + '.' + doc.id;
    var count = this._context.unsubscribeDoc(path, this._pass);

    if (!count) {
      // doc.cb = getCb(doc, path);
      docs2.push(doc);
    }
  }

  if (docs2.length) {
    if (model.root.fetchOnly) {
      unsubscribeDocCallback();
    } else {
      model.root.shareConnection.bulkUnsubscribe(docs2, cb);
    }
  }
}


/**
 * Removes the document from the local model if the model no longer has any
 * remaining fetches or subscribes on path.
 * Called from Model.prototype.unfetchDoc and Model.prototype.unsubscribeDoc as
 * part of attempted cleanup.
 * @param {String} collectionName
 * @param {String} id
 * @param {String} path
 */
Model.prototype._maybeUnloadDoc = function(collectionName, id) {
  var doc = this.getDoc(collectionName, id),
      path = collectionName + '.' + id;

  if (!doc) return;

  // console.log('_maybeUnloadDoc', collectionName, id, doc.shareDoc && doc.shareDoc.action, doc.shareDoc && doc.shareDoc.actions, this._context.subscribedCount(path))

  // still something going on
  if (doc.shareDoc) {
    if (doc.shareDoc.action || doc.shareDoc.actions.length) {
      // console.log('returning...');
      return;
    }
  }

  var count = this._context.subscribedCount(path);
  if (count) {
    return;
  }

  var previous = doc.get();
  this.root.collections[collectionName].remove(id);

  // TODO: There is a bug in ShareJS where a race condition between subscribe
  // and destroying the document data. For now, not cleaning up ShareJS docs
  if (doc.shareDoc) doc.shareDoc.destroy();

  delete this.root._loadVersions[path];
  this.emit('unload', [collectionName, id], [previous, this._pass]);
};
