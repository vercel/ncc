require = require('esm')(module);
const assert = require('assert');
assert.equal(require('./es-module.js').p, 5);
