const binary = require('./hello.node');
const assert = require('assert');

module.exports = () => {
  assert.equal(binary.hello(), 'world');
};