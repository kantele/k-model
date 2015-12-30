var Query = require('./Query'),
		Model = require('./Model'),
		methods = [ 'neighbors' ],
		defaultOptions = {
			direction: 'outbound'
		};

/*
** can also be called with arguments (collectionName, expression, db)
*/
Model.prototype.graph = function(graphName, collection, vertex, options) {
	var expression,
			graph;

	options = options || {};

	for (var key in defaultOptions) {
		if (typeof options[key] === 'undefined') {
			options[key] = defaultOptions[key];
		}
	}

	// is the "collection" actually an expression?
	if (typeof collection === 'object' && collection.$graph) {
		expression = collection;
		collection = graphName;
		graphName = expression.$graph;
	}
	else {
		expression = { $graph: graphName, $vertex: collection + '/' + vertex, $options: options };
	}

	graph = this.root._queries.get(collection, expression);
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

Graph.prototype._setResults = function(results) {
	var ids = resultsIds(results);
	this._setResultIds(ids);
};

function resultsIds(results) {
	var ids = [];
	for (var i = 0; i < results.length; i++) {
		var r = results[i];
		ids.push(r.substring(r.indexOf('/') + 1));
	}
	return ids;
}

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
