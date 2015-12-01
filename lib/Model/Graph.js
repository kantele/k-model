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
  }
  else {
    expression = { $graph: graphName, $vertex: collection + '/' + vertex };
  }

  var graph = this.root._queries.get(collection, expression);
  if (graph) return graph;

  graph = new Graph(this, collection, expression);
  this.root._queries.add(graph);

  return graph;
};

function Graph(model, collection, expression) {
  Query.call(this, model, collection, expression)
}

Graph.prototype = Object.create(Query.prototype)

Graph.prototype.delEdge = function() {}

Graph.prototype.addEdge = function() {}
