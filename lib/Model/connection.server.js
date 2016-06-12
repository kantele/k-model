var Model = require('./Model');

Model.prototype.createConnection = function(backend, req) {
  var model = this;
  this.root.backend = backend;
  this.root.req = req;
  this.root.connection = backend.connect(null, req);
  this.root.socket = this.root.connection.socket;
  // Pretend like we are always connected on the server for rendering purposes
  this._set(['$connection', 'state'], 'connected');
  this._finishCreateConnection();
  
  this.root.connection.on('rpc-bundle', function(data, callback) {
    // rpcServerCall is to notify subscribe functions that we don't actually want to send
    // messages to the backend at this point. We have all the data.
    model.root.rpcServerCall = true;
    model.unbundle(data, true);
    callback();
  });  

  this.root.connection.on('rpc-error', function(err, callback) {
    callback(err);
  });  
};

Model.prototype.connect = function() {
  this.root.backend.connect(this.root.connection, this.root.req);
  this.root.socket = this.root.connection.socket;
};
