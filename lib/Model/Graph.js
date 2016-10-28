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

// different "signatures":
// Model.prototype.graph = function(graphName, vertex, options)
// Model.prototype.graph = function(graphName, options)
// Model.prototype.graph = function(expression)
// Model.prototype.graph = function(graphName)

// vertex is of format "collection/id"
Model.prototype.graph = function(graphName, vertex, options) {
  var expression,
      graph;

  // expression or graphName
  if (arguments.length === 1) {
    // graphName
    if (typeof graphName === 'string') {
      expression = { $g: graphName };
      options = { deleteAfterOneSubmit: true };
    }
    // expression
    else {
      expression = graphName;
      graphName = expression.$g;
      vertex = expression.$v;
      options = expression.$o;
    }
  }
  // graphName, options
  else if (arguments.length === 2) {
    options = vertex;
    // vertex will be null
    expression = { $g: graphName, $v: vertex, $o: options };
  }
  // graph, vertex, options
  else {
    // expression = { $g: graphName, $c: collection, $v: vertex, $o: options };
    expression = { $g: graphName, $v: vertex, $o: options };
  }

  options = options || {};

  for (var key in defaultOptions) {
    if (typeof options[key] === 'undefined') {
      options[key] = defaultOptions[key];
    }
  }

  graph = this.root._queries.get(graphName, expression);
  if (graph) return graph;

  graph = new Graph(this, graphName, expression, options);
  this.root._queries.add(graph);

  return graph;
};

function Graph(model, graphName, expression, options) {
  Query.call(this, model, graphName, expression, options);
  // this.collectionName is to keep compatibility with Query
  this.graphName = this.collectionName = graphName;
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

Graph.prototype._shareFetchedSubscribe = function(options, cb) {
  this.shareQuery = this.model.root.connection.createFetchQuery(
    this.graphName,
    this.expression,
    options,
    this._subscribeCb(cb)
  );
};

Graph.prototype._shareSubscribe = function(options, cb) {
  var query = this;
  // Sanity check, though this shouldn't happen
  if (this.shareQuery) {
    this.shareQuery.destroy();
  }

  this.shareQuery = this.model.root.connection.createSubscribeQuery(
    this.graphName,
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

Graph.prototype._getShareResults = function() {
  var ids = this.model._get(this.idsSegments);
  return ids;
};

Graph.prototype.delVertex = function(vertex, cb) {
  this._doOp({ vertex: vertex, action: 'delvertex' }, cb);
};

Graph.prototype.delEdge = function(from, to, cb) {
  this._doOp({ from: from, to: to, action: 'del' }, cb);
};

Graph.prototype.addEdge = function(from, to, cb) {
  this._doOp({ from: from, to: to, action: 'create' }, cb);
};

Graph.prototype._doOp = function(op, cb) {
  var msg = {
        a: "gop",
        c: this.graphName,
        seq: undefined,
        src: undefined
      },
      self = this;

  if (op.action === 'create') {
    msg.create = true;
    msg.from = op.from;
    msg.to = op.to;
  }
  else if (op.action === 'del') {
    msg.del = true;
    msg.from = op.from;
    msg.to = op.to;
  }
  else if (op.action === 'delvertex') {
    msg.del = true;
    msg.vertex = op.vertex;
  }

  if (!this.shareQuery) {
    this._shareSubscribe(this.options, function(err) {
      self.shareQuery.submitOp(msg, function(err) {
        if (cb) {
          cb();
        }
      });
    });
  }
  else {
    this.shareQuery.submitOp(msg);
  }
}

module.exports = Graph;