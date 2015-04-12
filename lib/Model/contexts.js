/**
 * Contexts are useful for keeping track of the origin of subscribes.
 */

var Model = require('./Model');
var Query = require('./Query');

Model.INITS.push(function(model) {
  model.root._contexts = new Contexts();
  model.root.setContext('root');
});

Model.prototype.context = function(id) {
  var model = this._child();
  model.setContext(id);
  return model;
};

Model.prototype.setContext = function(id) {
  this._context = this.getOrCreateContext(id);
};

Model.prototype.getOrCreateContext = function(id) {
  return this.root._contexts[id] ||
    (this.root._contexts[id] = new Context(this, id));
};

Model.prototype.unload = function(id) {
  var context = (id) ? this.root._contexts[id] : this._context;
  context && context.unload();
};

Model.prototype.unloadAll = function() {
  var contexts = this.root._contexts;
  for (var key in contexts) {
    contexts[key].unload();
  }
};

function Contexts() {}

function FetchedDocs() {}
function SubscribedDocs() {}
function FetchedQueries() {}
function SubscribedQueries() {}

function FetchedDocsByQuery() {}
function SubscribedDocsByQuery() {}

function Context(model, id) {
  this.model = model;
  this.id = id;
  this.fetchedDocs = new FetchedDocs();
  this.subscribedDocs = new SubscribedDocs();
  this.fetchedQueries = new FetchedQueries();
  this.subscribedQueries = new SubscribedQueries();

  this.fetchedDocsByQuery = new FetchedDocsByQuery();
  this.subscribedDocsByQuery = new SubscribedDocsByQuery();
}

Context.prototype.toJSON = function() {
  return {
    fetchedDocs: this.fetchedDocs
  , subscribedDocs: this.subscribedDocs
  };
};

Context.prototype.fetchDoc = function(path, pass) {
  return this.docAction(path, mapIncrement, this.fetchedDocs, this.fetchedDocsByQuery, pass);
};
Context.prototype.subscribeDoc = function(path, pass) {
  return this.docAction(path, mapIncrement, this.subscribedDocs, this.subscribedDocsByQuery, pass);
};
Context.prototype.unfetchDoc = function(path, pass) {
  return this.docAction(path, mapDecrement, this.fetchedDocs, this.fetchedDocsByQuery, pass);
};
Context.prototype.unsubscribeDoc = function(path, pass) {
  return this.docAction(path, mapDecrement, this.subscribedDocs, this.subscribedDocsByQuery, pass);
};

Context.prototype.docAction = function(path, fn, map, mapQuery, pass) {
  if (pass.$query) { 
    fn(mapQuery, path);
  }
  else {
    fn(map, path);
  }
  return (map[path] || 0) + (mapQuery[path] || 0);
}

Context.prototype.fetchQuery = function(query) {
  mapIncrement(this.fetchedQueries, query.hash);
};
Context.prototype.subscribeQuery = function(query) {
  mapIncrement(this.subscribedQueries, query.hash);
};
Context.prototype.unfetchQuery = function(query) {
  mapDecrement(this.fetchedQueries, query.hash);
};
Context.prototype.unsubscribeQuery = function(query) {
  mapDecrement(this.subscribedQueries, query.hash);
};
function mapIncrement(map, key) {
  map[key] = (map[key] || 0) + 1;
}
function mapDecrement(map, key) {
  map[key] && map[key]--;
  if (!map[key]) delete map[key];
}

Context.prototype.unload = function() {
  var model = this.model;
  for (var hash in this.fetchedQueries) {
    var query = model.root._queries.get(hash);
    if (!query) continue;
    var count = this.fetchedQueries[hash];
    while (count--) query.unfetch();
  }
  for (var hash in this.subscribedQueries) {
    var query = model.root._queries.get(hash);
    if (!query) continue;
    var count = this.subscribedQueries[hash];
    while (count--) query.unsubscribe();
  }
  for (var path in this.fetchedDocs) {
    var segments = path.split('.');
    var count = this.fetchedDocs[path];
    while (count--) model.unfetchDoc(segments[0], segments[1]);
  }
  for (var path in this.subscribedDocs) {
    var segments = path.split('.');
    var count = this.subscribedDocs[path];
    while (count--) model.unsubscribeDoc(segments[0], segments[1], void 0, true);
  }
};
