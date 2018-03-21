var expect = require('../util').expect;
var racer = require('../../lib/index');

describe('notifications', function() {
  describe('test notifications', function() {
    beforeEach(function(done) {
      this.backend = racer.createBackend();
      this.model = this.backend.createModel();
      this.model.connection.on('connected', done);
    });

    it('notifications', function(done) {
      var doc = this.model.notification('notifications', 'hi');
      this.timeout(3000);

      var count = 0,
          max = 10,
          start = Date.now();

      function add() {
        doc.add(count);
      }

      this.model.ref('_page.color', doc);

      this.model.on('insert', '_page.color', function(a, b) {
        console.log('insert', count, b[0], Date.now() - start);

        if (count !== b[0]) {
          done(new Error('error: ' + count + ', ' + a + ', ' +  JSON.stringify(b)));
        }
        else {
          count++;

          if (max === count) {
            done();
          }
          else {
            setTimeout(add, 1);
          }
        }
      });

      doc.subscribe(function(err) {
        doc.add(count, function() { console.log('added'); });
      });

    });
  });
});
  