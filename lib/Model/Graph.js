var Query = require('./Query').Query,
    Queries = require('./Query').Queries,
    Model = require('./Model'),
  	methods = [ 'neighbors' ];

Model.INITS.push(function(model) {
  model.root._graphs = new Queries();
  if (model.root.fetchOnly) return;
  model.on('all', function(segments) {
    var map = model.root._graphs.map;
    for (var hash in map) {
      var query = map[hash];
      if (query.isPathQuery && query.shareQuery && util.mayImpact(query.expression, segments)) {
        var ids = pathIds(model, query.expression);
        var previousIds = model._get(query.idsSegments);
        query._onChange(ids, previousIds);
      }
    }
  });
});

Model.prototype.graph = function(graphName, collection, vertex) {
  var graph = this.root._graphs.get(graphName, vertex);
  if (graph) return graph;
  graph = new Graph(this, graphName, collection, vertex);
  this.root._graphs.add(graph);
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
