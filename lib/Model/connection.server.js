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
    model.unbundle(data);
    callback();
  });  
};

Model.prototype.connect = function() {
  this.root.backend.connect(this.root.connection, this.root.req);
  this.root.socket = this.root.connection.socket;
};
