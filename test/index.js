const assert = require('assert');
const fs = require('fs');
const ncc = require('../');

(async () => {
  // unit
  let cnt = 0;
  for (const unit of fs.readdirSync(__dirname + '/unit')) {
    cnt++;
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
  console.log(cnt + ' unit tests passed successfully.');

  // integration
  cnt = 0;
  for (const test of fs.readdirSync(__dirname + "/integration")) {
    cnt ++;
    const { code } = await ncc(__dirname + "/integration/" + test, { minify: false });
    try {
      let exports = {};
      let module = { exports };
      eval(code);
      if ("function" !== typeof module.exports) {
        console.error(
          `Integration test "${test}" evaluation failed. It does not export a "run" function`
        );
        continue;
      }
      await module.exports();
    } catch (err) {
      const locMatch = err.stack.toString().match(/\<anonymous\>:(\d+):(\d+)/);
      let locStr = '';
      if (locMatch) {
        const line = parseInt(locMatch[1]);
        locStr = '\n' + code.split(/\r\n|\r|\n/).slice(line - 2, line + 1).join('\n') + '\n';
      }
      console.error(`Integration test "${test}" execution failed${locStr}`, err);
      return;
    }
  }
  console.log(cnt + ' integration tests passed successfully.');
})();