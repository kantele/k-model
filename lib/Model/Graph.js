var Query = require('./Query').Query,
    Model = require('./Model'),
  	methods = [ 'neighbors' ];

Model.prototype.graph = function(graphName, collection, vertex) {
  var graph = this.root._queries.get(graphName, vertex);
  if (graph) return graph;
  graph = new Graph(this, graphName, collection, vertex);
  this.root._queries.add(graph);
  return graph;
};

function Graph(model, graphName, collection, vertex) {
  vertex = collection + '/' + vertex;
  Query.call(this, model, collection, { $graph: graphName, $vertex: vertex })
  this.graphName = graphName;
  this.vertex = vertex;
}

Graph.prototype = Object.create(Query.prototype)

Graph.prototype.delEdge = function() {}

Graph.prototype.addEdge = function() {}
