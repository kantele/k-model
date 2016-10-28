var Query = require('./Query'),
    Model = require('./Model');

/*
** can also be called with arguments (collectionName, expression, db)
*/
Model.prototype.notification = function(collection, id, persistent) {
  var expression,
      notification;

  // is the "collection" actually an expression?
  if (typeof id === 'object' && id.$n) {
    expression = id;
  }
  else {
    expression = { $i: id, $n: true };
  }

  notification = this.root._queries.get(collection, expression);
  if (notification) return notification;

  notification = new Notification(this, collection, expression, persistent);
  this.root._queries.add(notification);

  return notification;
};

function Notification(model, collection, expression, persistent) {
  Query.call(this, model, collection, expression);
  this.collectionName = collection;
  this.expression = expression;
  this.isNotification = true;
  this.persistent = persistent;
}

Notification.prototype = Object.create(Query.prototype)
Notification.prototype.constructor = Notification;

Notification.prototype.add = function(data) {
  var msg = {
    a: "nop",
    c: this.collectionName,
    index: this.expression.$i,
    data: data,
    seq: undefined,
    src: undefined
  };

  this.shareQuery.submitOp(msg);
};


Notification.prototype._setResults = function(results) {
  this._setResultIds(results);
};

Notification.prototype.get = function() {
  var data = this.model._get(this.segments);
  if (!data) {
    console.warn('You must fetch or subscribe to a query before getting its results.');
    return [];
  }

  return data.ids || [];
};

Notification.prototype.ref = function(from) {
  var idsPath = this.idsSegments.join('.');

  return this.model.refList(from, this.collectionName, idsPath, { idlist: true });
};

Notification.prototype._shareFetchedSubscribe = function(options, cb) {
  this.shareQuery = this.model.root.connection.createFetchQuery(
    this.collectionName,
    this.expression,
    options,
    this._subscribeCb(cb)
  );
};

Notification.prototype._shareSubscribe = function(options, cb) {
  var query = this;
  // Sanity check, though this shouldn't happen
  if (this.shareQuery) {
    this.shareQuery.destroy();
  }

  this.shareQuery = this.model.root.connection.createSubscribeQuery(
    this.collectionName,
    this.expression,
    options,
    this._subscribeCb(cb)
  );

  this.shareQuery.on('insert', function(shareDocs, index) {
    var ids = shareDocs;
    query._addMapIds(ids);
    query.model._insert(query.idsSegments, index, ids);
  });

  this.shareQuery.on('remove', function(shareDocs, index) {
    var ids = shareDocs;
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

Notification.prototype._getShareResults = function() {
  var ids = this.model._get(this.idsSegments);
  return ids;
};
