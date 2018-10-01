var Model = require('./Model');

Model.prototype.unbundle = function(data, rpcClientCall) {
  if (this.connection) this.connection.startBulk();

  // Re-create other documents
  for (var collectionName in data.collections) {
    var collection = data.collections[collectionName];
    for (var id in collection) {

      // in rpc calls, if there is already a document in the collection with the same id, we will remove it.
      if (rpcClientCall) {
  
        // rethink this
        // If this is a local collection and an array, and a similar local collection already exists,
        // we want to fill the array with the values from this "unbundle round".
        // Assume that the array contains strings (ids). So this is a specific work-around (rethink).
        // todo: maybe other kinds of collections too?
        var firstCharcter = collectionName.charAt(0);
        if (0 &&firstCharcter === '_' && Array.isArray(collection[id])) {
          var doc = this.getOrCreateDoc(collectionName, id, collection[id]);
          console.log('removeDocFromCollection', collectionName, id);
          console.log(doc);
          var datax = doc.get();
          if (Array.isArray(datax)) {
            for (var i = 0; i < collection[id].length; i++) {
              if (datax.indexOf(collection[id][i]) === -1) {
                doc.push('', collection[id][i], function() {});
              }
            }
          }

          continue;
        }
        else {
          this.removeDocFromCollection(collectionName, id);
        }
      }

      this.getOrCreateDoc(collectionName, id, collection[id]);
    }
  }

  // Re-create and subscribe queries; re-create documents associated with queries
  this._initQueries(data.queries, rpcClientCall);
  this._refreshPathQueries();

  for (var contextId in data.contexts) {
    var contextData = data.contexts[contextId];
    var contextModel = this.context(contextId);
    // Re-init fetchedDocs counts
    for (var collectionName in contextData.fetchedDocs) {
      var collection = contextData.fetchedDocs[collectionName];
      for (var id in collection) {
        var count = collection[id];
        while (count--) {
          contextModel._context.fetchDoc(collectionName, id);
          this._fetchedDocs.increment(collectionName, id);
        }
      }
    }
    // Subscribe to document subscriptions
    for (var collectionName in contextData.subscribedDocs) {
      var collection = contextData.subscribedDocs[collectionName];
      for (var id in collection) {
        var count = collection[id];
        while (count--) {
          contextModel.subscribeDoc(collectionName, id);
        }
      }
    }
    // Re-init createdDocs counts
    for (var collectionName in contextData.createdDocs) {
      var collection = contextData.createdDocs[collectionName];
      for (var id in collection) {
        // Count value doesn't matter for tracking creates
        contextModel._context.createDoc(collectionName, id);
      }
    }
  }

  if (this.connection) this.connection.endBulk();

  // Re-create fns
  if (data.fns)
    for (var i = 0; i < data.fns.length; i++) {
      var item = data.fns[i];
      this.start.apply(this, item);
    }
  // Re-create filters
  if (data.filters)
    for (var i = 0; i < data.filters.length; i++) {
      var item = data.filters[i];
      var filter = this._filters.add(item[1], item[2], item[3], item[4], item[5]);
      filter.ref(item[0]);
    }
  // Re-create refs
  if (data.refs)
    for (var i = 0; i < data.refs.length; i++) {
      var item = data.refs[i];
      this.ref(item[0], item[1]);
    }
  // Re-create refLists
  if (data.refLists)
    for (var i = 0; i < data.refLists.length; i++) {
      var item = data.refLists[i];
      this.refList(item[0], item[1], item[2], item[3]);
    }
};
