var Graph = require('./Graph'),
    Model = require('./Model');

/*
** can also be called with arguments (collectionName, expression, db)
*/
Model.prototype.notification = function(collection, id) {
  var expression,
      notification;

  // is the "collection" actually an expression?
  if (typeof id === 'object' && id.$n) {
    expression = id;
  }
  else {
    expression = { $i: id, $n: true };
  }

  notification = this.root._queries.get(collection, expression);
  if (notification) return notification;

  notification = new Notification(this, collection, expression);
  this.root._queries.add(notification);

  return notification;
};

function Notification(model, collection, expression) {
  Graph.call(this, model, collection, expression);
  this.collectionName = collection;
  this.expression = expression;
  this.isGraph = false;
  this.isNotification = true;
}

Notification.prototype = Object.create(Graph.prototype)
Notification.prototype.constructor = Notification;

Notification.prototype.addEdge = undefined;
Notification.prototype.delEdge = undefined;

Notification.prototype.add = function(data) {
  var msg = {
    a: "nop",
    c: this.collectionName,
    index: this.expression.$i,
    data: data,
    seq: undefined,
    src: undefined
  };

  this.shareQuery.submitOp(msg);
};
