const fontkit = require('fontkit');
const assert = require('assert');

module.exports = () => {
  assert.ok(fontkit.open);
};