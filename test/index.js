const assert = require('assert');
require('../')(__dirname + '/fixture.js').then((t) => {
  assert(t.code);
})
