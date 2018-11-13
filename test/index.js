const assert = require('assert');
const fs = require('fs');

const ncc = require('../');

(async () => {
  // unit
  for (const unit of fs.readdirSync(__dirname + '/unit')) {
    let actual, expected;
    try {
      expected = fs.readFileSync(__dirname + '/unit/' + unit + '/output.js').toString().trim();
      await ncc(__dirname + '/unit/' + unit + '/input.js', { minify: false }).then(async t => {
        actual = t.code.trim();
        assert.equal(actual, expected);
      });
    }
    catch (e) {
      console.error(`Unit test ${unit} failed.`);
      if (expected)
        console.error('Expected output:\n' + expected);
      if (actual)
        console.error('\nGot output:\n' + actual)
      console.error(e);
      return;
    }
  }

  // integration
  ncc(__dirname + '/fixture.js').then((t) => {
    eval(t.code);
  })
  .catch(e => {
    console.error(e);
  });
})();