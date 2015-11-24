var Model = require('./Model'),
	methods = [ 'neighbors' ];

Model.prototype.graph = function(method, graphName, exampleVertex) {

	if (typeof exampleVertex !== 'string') {
		throw new Error('graph/exampleVertex should be a string of the form collection/key');
	}

	// we pack this into an object for now to get around racer/k-model implementation 
	exampleVertex = { _id: exampleVertex };

	if (methods.indexOf(method) !== -1) {
		console.log('exampleVertex', exampleVertex);
		var q = this.query('graph/' + method + '/' + graphName, exampleVertex);
		return q;
		/*
		// unsubscribe for now, remove this later
		q.unsubscribe(function() {
			q.subscribe(cb);
		});
		*/
	}
	else {
		throw new Error('Invalid method: ' + method);
	}
};

