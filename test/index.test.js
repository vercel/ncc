const assert = require('assert');
const fs = require("fs");
const sourceMapSupport = require('source-map-support');
const ncc = require("../");

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

for (const unitTest of fs.readdirSync(`${__dirname}/unit`)) {
  it(`should generate correct output for ${unitTest}`, async () => {
    const expected = fs.readFileSync(`${__dirname}/unit/${unitTest}/output.js`)
        .toString().trim()
        // Windows support
        .replace(/\r/g, '');
    await ncc(`${__dirname}/unit/${unitTest}/input.js`, { minify: false }).then(async t => {
      const actual = t.code.trim();
      assert.strictEqual(actual, expected);
    });
  });
}

jest.setTimeout(10000);

for (const integrationTest of fs.readdirSync(__dirname + "/integration")) {
  it(`should evaluate ${integrationTest} without errors`, async () => {
    const { code, map } = await ncc(`${__dirname}/integration/${integrationTest}`, { minify: false, sourcemap: true });
    sourceMapSources[integrationTest] = map;
    module.exports = null;
    eval(`${code}\n//# sourceURL=${integrationTest}`);
    if ("function" !== typeof module.exports) {
      throw new Error(`Integration test "${integrationTest}" evaluation failed. It does not export a function`)
    }
    await module.exports();
  })
}