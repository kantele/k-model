var util = require('../util');
var Model = require('./Model');
var arrayDiff = require('k-arraydiff');
var defaultType = require('k-sync/lib/client').types.defaultType;

module.exports = Query;

function arrayEquals(a1, a2) {
  if (!a1 || !a2) {
    console.trace();
  }

  if (a1 === a2) {
    return true;
  }

  if (a1 && a2 && a1.length == a2.length) {
    for (var i = 0; i < a1.length; i++) {
      if (a1[i] !== a2[i]) {
        return false;
      }
    }

    return true;
  }
}

Model.INITS.push(function(model) {
  var previous;

  model.root._queries = new Queries();
  if (model.root.fetchOnly) return;
  model.on('all', function(segments) {
    var map = model.root._queries.map;
    for (var hash in map) {
      var query = map[hash];
      if (query.isPathQuery && query.shareQuery && util.mayImpact(query.expression, segments)) {
        var ids = pathIds(model, query.expression);
        var previousIds = model._get(query.idsSegments);
        if (!arrayEquals(previousIds, ids)) { 

          // todo: rethink this
          // This is a bit of a hack: the purpose
          // of this is to prevent that no unnecessary
          // queries are being sent to the server. As it is,
          // often these events happen in succession, like when
          // updating an array, and in those cases there may be
          // a query sent to the server many times, all of which
          // are also the same/equal queries. So this is to prevent
          // extra queries being sent. Note that sending those doesn't
          // hurt other than performance, so we don't test the exact 
          // equality, only the lengths.
          var newQuery = query.dbQuery();
          if (previous === query &&
            previous.isPathQuery &&
            previous.shareQuery &&
            arrayEquals(newQuery, previous.shareQuery.query)) {
            return;
          }

          query.setQuery(newQuery);
          query.send();
          previous = query;
        }
      }
    }
  });
});

Model.prototype.query = function(collectionName, expression, options) {
  expression = this.sanitizeQuery(expression);
  if (typeof expression === 'string') {
    expression = this._splitPath(expression);
  }
  // DEPRECATED: Passing in a string as the third argument specifies the db
  // option for backward compatibility
  if (typeof options === 'string') {
    options = {db: options};
  }
  var query = this.root._queries.get(collectionName, expression, options);
  if (query) return query;
  query = new Query(this, collectionName, expression, options);
  this.root._queries.add(query);
  return query;
};

// This method replaces undefined in query objects with null, because
// undefined properties are removed in JSON stringify. This can be dangerous
// in queries, where presenece of a property may indicate that it should be a
// filter and absence means that all values are accepted. We aren't checking
// for cycles, which aren't allowed in JSON, so this could throw a max call
// stack error
Model.prototype.sanitizeQuery = function(expression) {
  if (expression && typeof expression === 'object') {
    for (var key in expression) {
      if (expression.hasOwnProperty(key)) {
        var value = expression[key];
        if (value === undefined) {
          expression[key] = null;
        } else {
          this.sanitizeQuery(value);
        }
      }
    }
  }
  return expression;
};

// Called during initialization of the bundle on page load.
Model.prototype._initQueries = function(items, rpcClientCall) {
  var queries = this.root._queries;
  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    var counts = item[0];
    var collectionName = item[1];
    var expression = item[2];
    var results = item[3] || [];
    var options = item[4];
    var extra = item[5];

    if (expression && expression.$g) {
      var query = this.graph(expression);
    }
    else if (expression && expression.$n) {
      var query = this.notification(collectionName, expression);
    }
    else {
      var query = this.query(collectionName, expression, options);
    }

    queries.add(query);
    query._setExtra(extra);
    var ids = [];
    
    for (var idx = 0; idx < results.length; idx++) {
      ids.push(results[idx]);
    }

    // This is a bit of a hack, but it should be correct. Given that queries
    // are initialized first, the ids path is probably not set yet, but it will
    // be used to generate the query. Therefore, we assume that the value of
    // path will be the ids that the query results were on the server. There
    // are probably some really odd edge cases where this doesn't work, and
    // a more correct thing to do would be to get the actual value for the
    // path before creating the query subscription. This feature should
    // probably be rethought.
    if (query.isPathQuery && expression.length > 0 && this._isLocal(expression[0])) {
      this._setNull(expression, ids.slice());
    }

    query._addMapIds(ids);
    this._set(query.idsSegments, ids);

    for (var idx = 0; idx < counts.length; idx++) {
      var count = counts[idx];
      var subscribed = count[0] || 0;
      var fetched = count[1] || 0;
      var contextId = count[2];
      if (contextId) query.model.setContext(contextId);
      while (subscribed--) {
        query.subscribe(null, rpcClientCall);
      }
      query.fetchCount += fetched;
      while (fetched--) {
        query.model._context.fetchQuery(query);
      }
    }
  }
};

function Queries() {
  // Map is a flattened map of queries by hash. Currently used in contexts
  this.map = {};
  // Collections is a nested map of queries by collection then hash
  this.collections = {};
}
Queries.prototype.add = function(query) {
  this.map[query.hash] = query;
  var collection = this.collections[query.collectionName] ||
    (this.collections[query.collectionName] = {});
  collection[query.hash] = query;
};
Queries.prototype.remove = function(query) {
  delete this.map[query.hash];
  var collection = this.collections[query.collectionName];
  if (!collection) return;
  delete collection[query.hash];
  // Check if the collection still has any keys
  // eslint-disable-next-line no-unused-vars
  for (var key in collection) return;
  delete this.collections[collection];
};
Queries.prototype.get = function(collectionName, expression, options) {
  var hash = expression? queryHash(collectionName, expression, options): collectionName;
  return this.map[hash];
};
Queries.prototype.toJSON = function() {
  var out = [];
  for (var hash in this.map) {
    var query = this.map[hash];
    if (query.subscribeCount || query.fetchCount) {
      out.push(query.serialize());
    }
  }
  return out;
};

function Query(model, collectionName, expression, options) {
  options = options || {};
  this.model = model.pass({$query: this});
  this.collectionName = collectionName;
  this.expression = expression;
  this.options = options;
  this.db = options.db;
  this.hash = queryHash(collectionName, expression, this.db);
  this.segments = ['$queries', this.hash];
  this.idsSegments = ['$queries', this.hash, 'ids'];
  this.extraSegments = ['$queries', this.hash, 'extra'];
  this.isPathQuery = Array.isArray(expression);

  this._pendingSubscribeCallbacks = [];

  // These are used to help cleanup appropriately when calling unsubscribe and
  // unfetch. A query won't be fully cleaned up until unfetch and unsubscribe
  // are called the same number of times that fetch and subscribe were called.
  this.subscribeCount = 0;
  this.fetchCount = 0;

  this.deleted = false;
  this.shareQuery = null;

  // idMap is checked in maybeUnload to see if the query is currently holding
  // a reference to an id in its results set. This map is duplicative of the
  // actual results id list stored in the model, but we are maintaining it,
  // because otherwise maybeUnload would be looping through the entire results
  // set of each query on the same collection for every doc checked
  //
  // Map of id -> true
  this.idMap = {};
}

Query.prototype.destroy = function() {
  // this may have been already destroyed
  if (this.deleted) {
    return;
  }

  this.deleted = true;
  var ids = this.getIds();

  if (this.shareQuery) {
    this.shareQuery.destroy();
    this.shareQuery = null;
  }
  this.model.root._queries.remove(this);
  this.idMap = {};
  this.model._del(this.segments);
  this._maybeUnloadDocs(ids);
};

Query.prototype.dbQuery = function() {
  if (this.isPathQuery) {
    var ids = pathIds(this.model, this.expression);
    return ids;
  }
  return this.expression;
};

Query.prototype.send = function() {
  this.shareQuery.send();
};

Query.prototype.setOptions = function(options) {
  this.options = options;

  if (this.expression && this.expression.$o) {
    this.expression.$o = options;
  }

  if (this.shareQuery) {
    this.shareQuery.setOptions(options);
    this.shareQuery.setQuery(this.expression);
  }
};

Query.prototype.setQuery = function(expression) {
  // we will set only the expression - not touch in hash etc. as they don't
  // really matter for the query that takes place 
  // (and it would be brittle to change those at this point)
  // Also, only set this here if this query is not a path query
  // because ...
  if (!this.isPathQuery) {
    this.expression = expression;
  }

  this.shareQuery.setQuery(expression);
};

Query.prototype.fetch = function(cb) {
  cb = this.model.wrapCallback(cb);
  this.model._context.fetchQuery(this);

  this.fetchCount++;

  if (this.deleted) {
    console.warn('Trying to fetch with a deleted query', this.hash);
    return;
  }

  var query = this,
      model = this.model,
      options = { db: this.db };

  function fetchCb(err, results, extra) {
    if (err) return cb(err);
    query._setExtra(extra);
    query._setResults(results);
    cb();
  }
  this.model.root.connection.createFetchQuery(
    this.collectionName,
    this.dbQuery(),
    options,
    fetchCb
  );
  return this;
};

Query.prototype.subscribe = function(cb, rpcClientCall) {
  var self = this;
  cb = this.model.wrapCallback(cb);
  this.model._context.subscribeQuery(this);

  if (this.subscribeCount++) {
    var query = this;
    process.nextTick(function() {
      var data = query.model._get(query.segments);
      if (data) {
        cb();
      } else {
        query._pendingSubscribeCallbacks.push(cb);
      }
    });
    return this;
  }

  if (this.deleted) {
    console.warn('Trying to subscribe with a deleted query', query.hash);
    return;
  }

  var options = (this.options) ? util.copy(this.options) : {};
  options.results = this._getShareResults();

  // When doing server-side rendering, we actually do a fetch the first time
  // that subscribe is called, but keep track of the state as if subscribe
  // were called for proper initialization in the client
  if (!this.model.root.rpcServerCall) {
    function send() {
      if (self.model.root.fetchOnly) {
        self._shareFetchedSubscribe(options, cb);
      } else {
        self._shareSubscribe(options, cb);
      }
    }

    // this is to optimize rpc calls
    // when unbundling rpc calls, we don't need to do this syncronically
    if (rpcClientCall) {
      setTimeout(send, 0);
    }
    else {
      send();
    }
  }

  return this;
};

Query.prototype._subscribeCb = function(cb) {
  var query = this;
  return function subscribeCb(err, results, extra) {
    if (err) return query._flushSubscribeCallbacks(err, cb);
    query._setExtra(extra);
    query._setResults(results);
    query._flushSubscribeCallbacks(null, cb);
  };
};

Query.prototype._shareFetchedSubscribe = function(options, cb) {
  this.model.root.connection.createFetchQuery(
    this.collectionName,
    this.dbQuery(),
    options,
    this._subscribeCb(cb)
  );
};

Query.prototype._shareSubscribe = function(options, cb) {
  var query = this;
  // Sanity check, though this shouldn't happen
  if (this.shareQuery) {
    this.shareQuery.destroy();
  }
  this.shareQuery = this.model.root.connection.createSubscribeQuery(
    this.collectionName,
    this.dbQuery(),
    options,
    this._subscribeCb(cb)
  );
  this.shareQuery.on('insert', function(shareDocs, index) {
    var ids = resultsIds(shareDocs);
    query._addMapIds(ids);
    query.model._insert(query.idsSegments, index, ids);
  });
  this.shareQuery.on('remove', function(shareDocs, index) {
    var ids = resultsIds(shareDocs);
    query._removeMapIds(ids);
    query.model._remove(query.idsSegments, index, shareDocs.length);
  });
  this.shareQuery.on('move', function(shareDocs, from, to) {
    query.model._move(query.idsSegments, from, to, shareDocs.length);
  });
  this.shareQuery.on('extra', function(extra) {
    query.model._setDiffDeep(query.extraSegments, extra);
  });
  this.shareQuery.on('error', function(err) {
    query.model._emitError(err, query.hash);
  });
};

Query.prototype._removeMapIds = function(ids) {
  for (var i = ids.length; i--;) {
    var id = ids[i];
    delete this.idMap[id];
  }

  //  this._maybeUnloadDocs(ids);
};
Query.prototype._addMapIds = function(ids) {
  for (var i = ids.length; i--;) {
    var id = ids[i];
    this.idMap[id] = true;
  }
};
Query.prototype._diffMapIds = function(ids) {
  var addedIds = [];
  var removedIds = [];
  var newMap = {};
  for (var i = ids.length; i--;) {
    var id = ids[i];
    newMap[id] = true;
    if (this.idMap[id]) continue;
    addedIds.push(id);
  }
  for (var id in this.idMap) {
    if (newMap[id]) continue;
    removedIds.push(id);
  }
  if (addedIds.length) this._addMapIds(addedIds);
  if (removedIds.length) this._removeMapIds(removedIds);
};
Query.prototype._setExtra = function(extra) {
  if (extra === undefined) return;
  this.model._setDiffDeep(this.extraSegments, extra);
};
Query.prototype._setResults = function(results) {
  var ids = resultsIds(results);
  this._setResultIds(ids);
};
Query.prototype._setResultIds = function(ids) {
  this._diffMapIds(ids);
  this.model._setArrayDiff(this.idsSegments, ids);
};
Query.prototype._maybeUnloadDocs = function(ids) {
  for (var i = 0; i < ids.length; i++) {
    var id = ids[i];
    this.model._maybeUnloadDoc(this.collectionName, id);
  }
};

// Flushes `_pendingSubscribeCallbacks`, calling each callback in the array,
// with an optional error to pass into each. `_pendingSubscribeCallbacks` will
// be empty after this runs.
Query.prototype._flushSubscribeCallbacks = function(err, cb) {
  cb(err);
  var pendingCallback;
  while ((pendingCallback = this._pendingSubscribeCallbacks.shift())) {
    pendingCallback(err);
  }
};

Query.prototype.unfetch = function(cb) {
  cb = this.model.wrapCallback(cb);
  this.model._context.unfetchQuery(this);

  // No effect if the query is not currently fetched
  if (!this.fetchCount) {
    cb();
    return this;
  }

  var query = this;
  finishUnfetchQuery();

  function finishUnfetchQuery() {
    var count = --query.fetchCount;
    if (count) return cb(null, count);
    // Cleanup when no fetches or subscribes remain
    if (!query.subscribeCount) query.destroy();
    cb(null, 0);
  }
  return this;
};

Query.prototype.unsubscribe = function(cb) {
  var query = this;

  cb = this.model.wrapCallback(cb);
  this.model._context.unsubscribeQuery(this);

  // No effect if the query is not currently subscribed
  // or if this is a persistent query
  if (!this.subscribeCount || this.persistent) {
    // shareQuery may be around that we want to get rid of. This is because 
    // Graph and Notification may create shareQuery even they are not "subscribed".
    if (!this.persistent) destroyShareQuery();

    cb();
    return this;
  }

  finishUnsubscribeQuery();

  function destroyShareQuery() {
    if (query.shareQuery) {
      query.shareQuery.destroy();
      query.shareQuery = null;
    }
  }

  function finishUnsubscribeQuery() {
    var count = --query.subscribeCount;
    if (count) return cb(null, count);

    destroyShareQuery();
    unsubscribeQueryCallback();
  }

  function unsubscribeQueryCallback(err) {
    if (err) return cb(err);
    // Cleanup when no fetches or subscribes remain
    if (!query.fetchCount && !query.subscribeCount) query.destroy();
    cb(null, 0);
  }
  return this;
};

Query.prototype._getShareResults = function() {
  var ids = this.model._get(this.idsSegments);
  if (!ids) return;

  var collection = this.model.getCollection(this.collectionName);
  if (!collection) return;

  var results = [];
  for (var i = 0; i < ids.length; i++) {
    var id = ids[i];
    var doc = collection.docs[id];
    results.push(doc && doc.shareDoc);
  }
  return results;
};

Query.prototype.get = function() {
  var d, results = this.options.byid? {}: [];
  var data = this.model._get(this.segments);
  if (!data) {
    console.warn('You must fetch or subscribe to a query before getting its results.');
    return results;
  }
  var ids = data.ids;
  if (!ids) return results;

  var collection = this.model.getCollection(this.collectionName);
  for (var i = 0, l = ids.length; i < l; i++) {
    var id = ids[i];
    var doc = collection && collection.docs[id];
    if (doc && (d = doc.get())) {
      this.options.byid? results[id] = d: results.push(d);
    }
  }
  return results;
};

Query.prototype.getIds = function() {
  return this.model._get(this.idsSegments) || [];
};

Query.prototype.getExtra = function() {
  return this.model._get(this.extraSegments);
};

Query.prototype.ref = function(from) {
  var idsPath = this.idsSegments.join('.');

  if (this.options.byid) {
    return this.model.refList(from, this.collectionName, idsPath, { byid: true });
  }
  else {
    return this.model.refList(from, this.collectionName, idsPath);
  }
};

Query.prototype.refIds = function(from) {
  var idsPath = this.idsSegments.join('.');
  return this.model.root.ref(from, idsPath);
};

Query.prototype.refExtra = function(from, relPath) {
  var extraPath = this.extraSegments.join('.');
  if (relPath) extraPath += '.' + relPath;
  return this.model.root.ref(from, extraPath);
};

Query.prototype.serialize = function() {
  var ids = this.getIds();
  var results = [];

  // we store only the ids, as collections (actual data) are sent separately 
  for (var i = 0; i < ids.length; i++) {
    var id = ids[i];
    results.push(id);
  }

  var counts = [];
  var contexts = this.model.root._contexts;
  for (var key in contexts) {
    var context = contexts[key];
    var subscribed = context.subscribedQueries[this.hash] || 0;
    var fetched = context.fetchedQueries[this.hash] || 0;
    if (subscribed || fetched) {
      if (key !== 'root') {
        counts.push([subscribed, fetched, key]);
      } else if (fetched) {
        counts.push([subscribed, fetched]);
      } else {
        counts.push([subscribed]);
      }
    }
  }
  var serialized = [
    counts,
    this.collectionName,
    this.expression,
    results,
    this.options,
    this.getExtra()
  ];
  while (serialized[serialized.length - 1] == null) {
    serialized.pop();
  }
  return serialized;
};

function queryHash(collectionName, expression, options) {
  var args = [collectionName, expression, options];
  return JSON.stringify(args).replace(/\./g, '|');
}

function resultsIds(results) {
  var ids = [];
  if (results) {
    for (var i = 0; i < results.length; i++) {
      var shareDoc = results[i];
      ids.push(shareDoc.id);
    }
  }
  return ids;
}

function pathIds(model, segments) {
  var value = model._get(segments);
  return (typeof value === 'string') ? [value] :
    (Array.isArray(value)) ? value.slice() : [];
}

Query.prototype._onChange = function(ids, previousIds) {
  // Diff the new and previous list of ids, subscribing to documents for
  // inserted ids and unsubscribing from documents for removed ids
  var diff = (previousIds) ?
    arrayDiff(previousIds, ids) :
    [new arrayDiff.InsertDiff(0, ids)];
  var previousCopy = previousIds && previousIds.slice();

  // The results are updated via a different diff, since they might already
  // have a value from a fetch or previous shareQuery instance
  this.model._setArrayDiff(this.idsSegments, ids);

  for (var i = 0; i < diff.length; i++) {
    var item = diff[i];
    if (item instanceof arrayDiff.InsertDiff) {
      // Subscribe to the document for each inserted id
      var values = item.values;
      for (var j = 0; j < values.length; j++) {
        this.model.subscribeDoc(this.collectionName, values[j]);
      }
    } else if (item instanceof arrayDiff.RemoveDiff) {
      var values = previousCopy.splice(item.index, item.howMany);
      // Unsubscribe from the document for each removed id
      for (var j = 0; j < values.length; j++) {
        this.model.unsubscribeDoc(this.collectionName, values[j]);
      }
    }
    // Moving doesn't change document subscriptions, so that is ignored.
  }
};
