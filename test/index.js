const assert = require('assert');
const fs = require('fs');
const sourceMapSupport = require('source-map-support');
const ncc = require('../');

const sourceMapSources = {};
sourceMapSupport.install({
  retrieveSourceMap (source) {
    if (!sourceMapSources[source])
      return null;

    return {
      url: source,
      map: sourceMapSources[source]
    };
  }
});

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
    const { code, map } = await ncc(__dirname + "/integration/" + test, { minify: false, sourcemap: true });
    try {
      let exports = {};
      let module = { exports };
      const id = test;
      sourceMapSources[id] = map;
      eval(code + '\n//# sourceURL=' + id);
      if ("function" !== typeof module.exports) {
        console.error(
          `Integration test "${test}" evaluation failed. It does not export a "run" function`
        );
        continue;
      }
      await module.exports();
    } catch (err) {
      console.error(`Integration test "${test}" execution failed`, err);
      return;
    }
  }
  console.log(cnt + ' integration tests passed successfully.');
})();