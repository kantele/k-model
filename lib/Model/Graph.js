var Query = require('./Query'),
    Model = require('./Model'),
    methods = [ 'neighbors' ],
    defaultOptions = {
      direction: 'outbound'
    };

/*
** We need a convenient way to get a graph - the "ref" is such a way.
** I.e. if a graph has been set to to a reference (_page.graphRef), it 
** can be used to get the graph by model.graph('_page.graphRef').
*/
Model.prototype._graphByRef = function(path) {
  var refList = this.root._refLists && this.root._refLists.fromMap && this.root._refLists.fromMap[path] && this.root._refLists.fromMap[path].idsSegments && this.root._refLists.fromMap[path].idsSegments[1];

  if (refList) {
    return this.root._queries.get(refList);
  }
}

/*
** can also be called with arguments:
**   collectionName, expression, options
**   refList
*/
Model.prototype.graph = function(graphName, collection, vertex, options) {
  var expression,
      graph;

  if (arguments.length === 1) {
    return this._graphByRef(arguments[0]);
  }

  // collection, expression, options
  if (typeof collection === 'object' && collection.$g) {
    expression = collection;
    collection = graphName;
    graphName = expression.$g;
    options = vertex;
  }
  else {
    // graph, collection, vertex, options
    expression = { $g: graphName, $c: collection, $v: vertex, $o: options };
  }

  options = options || {};

  for (var key in defaultOptions) {
    if (typeof options[key] === 'undefined') {
      options[key] = defaultOptions[key];
    }
  }

  graph = this.root._queries.get(collection, expression);
  if (graph) return graph;

  graph = new Graph(this, graphName, collection, expression, options);
  this.root._queries.add(graph);

  return graph;
};

function Graph(model, graphName, collection, expression, options) {
  Query.call(this, model, collection, expression, options);
  this.graphName = graphName;
  this.isGraph = true;
}

Graph.prototype = Object.create(Query.prototype)
Graph.prototype.constructor = Graph;

Graph.prototype._setResults = function(results) {
  this._setResultIds(results);
};

Graph.prototype.get = function() {
  var data = this.model._get(this.segments);
  if (!data) {
    console.warn('You must fetch or subscribe to a query before getting its results.');
    return [];
  }

  return data.ids || [];
};

Graph.prototype.ref = function(from) {
  var idsPath = this.idsSegments.join('.');

  return this.model.refList(from, this.collectionName, idsPath, { idlist: true });
};

Graph.prototype._shareSubscribe = function(options, cb) {
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

Graph.prototype._getShareResults = function() {
  var ids = this.model._get(this.idsSegments);
  return ids;
};

Graph.prototype.delEdge = function(from, to) {
  var msg = {
    a: "gop",
    c: this.graphName,
    from: this.collectionName + '/' + from,
    to: this.collectionName + '/' + to,
    del: true,
    seq: undefined,
    src: undefined
  };

  this.shareQuery.submitOp(msg);
};

Graph.prototype.addEdge = function(from, to) {
  var msg = {
    a: "gop",
    c: this.graphName,
    from: this.collectionName + '/' + from,
    to: this.collectionName + '/' + to,
    create: true,
    seq: undefined,
    src: undefined
  };

  this.shareQuery.submitOp(msg);
};

module.exports = Graph;