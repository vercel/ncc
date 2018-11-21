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

// the twilio test can take a while (large codebase)
jest.setTimeout(30000);

for (const integrationTest of fs.readdirSync(__dirname + "/integration")) {
  // ignore e.g.: `.json` files
  if (!integrationTest.endsWith(".js")) continue;
  it(`should evaluate ${integrationTest} without errors`, async () => {
    const { code, map, assets } = await ncc(__dirname + "/integration/" + integrationTest, { sourceMap: true });
    module.exports = null;
    sourceMapSources[integrationTest] = map;
    eval(`${code}\n//# sourceURL=${integrationTest}`);
    if ("function" !== typeof module.exports) {
      throw new Error(
        `Integration test "${integrationTest}" evaluation failed. It does not export a function`
      );
    }
    await module.exports();
  });
}
