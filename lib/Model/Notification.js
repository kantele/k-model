var Query = require('./Query'),
    Model = require('./Model');

/*
** can also be called with arguments (collectionName, expression, db)
*/
Model.prototype.notification = function(collection, id, persistent) {
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

  notification = new Notification(this, collection, expression, persistent);
  this.root._queries.add(notification);

  return notification;
};

function Notification(model, collection, expression, persistent) {
  Query.call(this, model, collection, expression);
  this.collectionName = collection;
  this.expression = expression;
  this.isGraph = false;
  this.isNotification = true;
  this.persistent = persistent;
}

Notification.prototype = Object.create(Query.prototype)
Notification.prototype.constructor = Notification;

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
