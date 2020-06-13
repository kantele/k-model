var Model = require('./Model'),
    MD5 = require('md5');

/*
** "notification" is a queue of entries (document ids) that the client is subscribed to
**
** TODO: replace with a proper queue software?
**
*/


function add(data, cb) {
  var self = this;

  // Add an entry to the queue.
  // The queue is 100 items of length, if it overflows, the client can fetch the items manually.
  self.fetch(function(err) {
    self.unshift('queue', data, function(err) {

      if (self.get('queue').length > 100) {
        self.pop('queue', function() {
          self.unfetch();
          if (cb) cb();
        });
      }
      else {
        self.unfetch();
        if (cb) cb();
      }      
    });
  });
}


Model.prototype.notification = function(collection, id, persistent) {
  var notification,
      self = this,
      realCollectionId = MD5(collection + "-" + id);

  function get(collection, id, persistent, notification, realCollectionId) {
    
    notification.fetch(function(err) {
      if (err) {
        console.log('Model.notification', err);
      }

      // Add the document if it doesn't exist
      if (!notification.get()) {
        
        self.add("k-notifications", { id: realCollectionId, queue: [] }, function(err) {
          if (err) {
            console.log('add failed', collection, id, realCollectionId);
            console.log(err.toString());
          }
        });
      }

      notification.unfetch();
    }); 
  }

  notification = this.at("k-notifications." + realCollectionId, persistent? true: false);
  notification.add = add;

  get(collection, id, persistent, notification, realCollectionId);

  return notification;
};
