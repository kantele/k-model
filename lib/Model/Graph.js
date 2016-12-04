var Query = require('./Query'),
    Model = require('./Model');

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
// Model.prototype.graph = function(graphName, options)
// Model.prototype.graph = function(expression)
// Model.prototype.graph = function(graphName)
// Model.prototype.graph = function(graphPath)

// vertex is of format "collection/id"
// Model.prototype.graph = function(graphName, vertex, data, options) {
Model.prototype.graph = function(graphName, options) {
  var expression,
      graph;

  // expression
  //   - or -
  // graphName
  //   - or -
  // graphPath
  if (arguments.length === 1) {
    // graphPath
    if (typeof graphName === 'string' && graphName.indexOf('.') !== -1) {
      return this._graphByRef(graphName);
    }
    // graphName
    else if (typeof graphName === 'string') {
      expression = { $g: graphName };
      options = { deleteAfterOneSubmit: true, createNew: true };
    }
    // expression
    else {
      expression = graphName;
      graphName = expression.$g;
      options = expression.$o;
    }
  }
  // graphName, vertex
  //   - or -
  // graphName, options
  else if (arguments.length === 2) {
    if (typeof vertex === 'string') {
      // expression = { $g: graphName, $v: vertex };
      throw new Error('not supported anymore')
    }
    else {
      expression = { $g: graphName };

      if (options.from) {
        expression.$from = options.from;
        delete options.from;
      }

      if (options.to) {
        expression.$to = options.to;
        delete options.to;
      }

      if (options.vertex) {
        expression.$v = options.vertex;
        delete options.vertex;
      }

      if (options.data) {
        expression.$d = options.data;
        delete options.data;
      }

      // the rest should be in the expression.$o
      expression.$o = options;
    }
  }

  options = options || {};

  // options.createNew means: always create a new Graph
  // (if it isn't set, we can try to get an old graph)
  if (!options.createNew) {
    graph = this.root._queries.get(graphName, expression);
    if (graph) return graph;
  }

  graph = new Graph(this, graphName, expression, options);
  this.root._queries.add(graph);

  return graph;
};

function Graph(model, graphName, expression, options) {
  Query.call(this, model, graphName, expression, options);
  this.graphName = graphName;
  // collectionName should include options, as options will affect the results
  this.collectionName = this.hash;
  this.isGraph = true;
}

Graph.prototype = Object.create(Query.prototype)
Graph.prototype.constructor = Graph;

Graph.prototype._shareFetchedSubscribe = function(options, cb) {
  this.shareQuery = this.model.root.connection.createFetchQuery(
    this.collectionName,
    this.expression,
    options,
    this._subscribeCb(cb)
  );
};

/*
** Two ways to call:
**   from, to, data, cb 
**   object, cb 
**     object holds:
**       from: <string>
**       to: <string>
**       data: <object>
*/
Graph.prototype.addEdge = function(from, to, data, cb) {
  var op = { from: from, to: to, action: 'create' };

  if (typeof from === 'object') {
    op = from;
    op.action = 'create';
    cb = to;
  }
  else if (typeof data === 'function') {
    cb = data;
  }
  else {
    op.data = data;
  }

  this._doOp(op, cb);
};

/*
** Two ways to call:
**   from, to, data, cb 
**   object, cb 
**     object holds:
**       from: <string>
**       to: <string>
**       data: <object>
*/
Graph.prototype.delEdge = function(from, to, data, cb) {
  var op = { from: from, to: to, action: 'del' };

  if (typeof from === 'object') {
    op = from;
    op.action = 'del';
    cb = to;
  }
  else if (typeof data === 'function') {
    cb = data;
  }
  else {
    op.data = data;
  }

  this._doOp(op, cb);
};

Graph.prototype.delVertex = function(vertex, cb) {
  this._doOp({ vertex: vertex, action: 'delvertex' }, cb);
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
  else if (op.action === 'get') {
    msg.get = true;
    msg.from = op.from;
    msg.to = op.to;
  }

  if (op.data) {
    msg.data = op.data;
  }

  if (!this.shareQuery) {
    this._shareSubscribe(this.options, function(err) {
      self.shareQuery.submitOp(msg, function(err) {
        if (self.options.deleteAfterOneSubmit) {
          self.unsubscribe(cb);
        }
        else if (cb) {
          cb();
        }
      });
    });
  }
  else {
    this.shareQuery.submitOp(msg, function(err) {
        if (self.options.deleteAfterOneSubmit) {
          self.unsubscribe(cb);
        }
        else if (cb) {
          cb();
        }
    });
  }
}

module.exports = Graph;