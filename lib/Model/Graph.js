var Query = require('./Query').Query,
    Model = require('./Model'),
  	methods = [ 'neighbors' ];

/*
** can also be called with arguments (collectionName, expression, db)
*/
Model.prototype.graph = function(graphName, collection, vertex) {
  var expression;

  if (typeof collection === 'object' && collection.$graph) {
    expression = collection;
    collection = graphName;
    graphName = expression.$graph;
  }
  else {
    expression = { $graph: graphName, $vertex: collection + '/' + vertex };
  }

  var graph = this.root._queries.get(collection, expression);
  if (graph) return graph;

  graph = new Graph(this, graphName, collection, expression);
  this.root._queries.add(graph);

  return graph;
};

function Graph(model, graphName, collection, expression) {
  Query.call(this, model, collection, expression);
  this.graphName = graphName;
}

Graph.prototype = Object.create(Query.prototype)
Graph.prototype.constructor = Graph;

Graph.prototype.delEdge = function(from, to) {
  msg = {
    a: "gop",
    c: this.graphName,
    from: this.collectionName + '/' + from,
    to: this.collectionName + '/' + to,
    type: 'del',
    seq: undefined,
    src: undefined
  };

  this.shareQuery.submitOp(msg);
};

Graph.prototype.addEdge = function(from, to) {

};
