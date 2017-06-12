var Query = require('./Query'),
    Model = require('./Model'),
    methods = [ 'neighbors' ],
    defaultOptions = {
      direction: 'outbound'
    };

Model.prototype.execute = function(fnName, params, cb) {
  var options = { deleteAfterOneSubmit: true }
      expression = { $f: fnName, $p: params };

  storedFunction = this.root._queries.get(fnName, expression);

  if (!storedFunction) {
    storedFunction = new StoredFunction(this, fnName, expression, options);
    this.root._queries.add(storedFunction);
  }

  storedFunction._shareFetchedSubscribe(options, cb);

  return storedFunction;
}

function StoredFunction(model, fnName, expression, options) {
  Query.call(this, model, fnName, expression, options);
  // this.collectionName is to keep compatibility with Query
  this.fnName = this.collectionName = fnName;
  this.isStoredFunction = true;
}

StoredFunction.prototype = Object.create(Query.prototype)
StoredFunction.prototype.constructor = StoredFunction;

// Flushes `_pendingSubscribeCallbacks`, calling each callback in the array,
// with an optional error to pass into each. `_pendingSubscribeCallbacks` will
// be empty after this runs.
StoredFunction.prototype._flushSubscribeCallbacks = function(err, cb) {
  cb(err, this.get());
  var pendingCallback;
  while ((pendingCallback = this._pendingSubscribeCallbacks.shift())) {
    pendingCallback(err);
  }
};

module.exports = Model.prototype.execute;