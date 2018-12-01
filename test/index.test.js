const fs = require("fs");
const ncc = global.coverage ? require("../src/index") : require("../");
const mkdirp = require("mkdirp");
const rimraf = require("rimraf");
const { dirname } = require("path");

const sourceMapSources = {};
if (!global.coverage) {
  require('source-map-support').install({
    retrieveSourceMap (source) {
      if (!sourceMapSources[source])
        return null;

      return {
        url: source,
        map: sourceMapSources[source]
      };
    }
  });
}

for (const unitTest of fs.readdirSync(`${__dirname}/unit`)) {
  it(`should generate correct output for ${unitTest}`, async () => {
    const expected = fs.readFileSync(`${__dirname}/unit/${unitTest}/output.js`)
        .toString().trim()
        // Windows support
        .replace(/\r/g, '');
    await ncc(`${__dirname}/unit/${unitTest}/input.js`, { minify: false }).then(async ({ code, assets }) => {
      // very simple asset validation in unit tests
      if (unitTest.startsWith('asset-')) {
        expect(Object.keys(assets).length).toBeGreaterThan(0);
        expect(assets[Object.keys(assets)[0]] instanceof Buffer);
      }
      const actual = code.trim()
      // Windows support
      .replace(/\r/g, '');
      try {
        expect(actual).toBe(expected);
      }
      catch (e) {
        // useful for updating fixtures
        fs.writeFileSync(`${__dirname}/unit/${unitTest}/actual.js`, actual);
        throw e;
      }
    });
  });
}

// the twilio test can take a while (large codebase)
jest.setTimeout(30000);

function clearTmp () {
  try {
    rimraf.sync(__dirname + "/tmp");
  }
  catch (e) {
    if (e.code !== "ENOENT")
      throw e;
  }
}

for (const integrationTest of fs.readdirSync(__dirname + "/integration")) {
  // ignore e.g.: `.json` files
  if (!integrationTest.endsWith(".js")) continue;
  it(`should evaluate ${integrationTest} without errors`, async () => {
    const { code, map, assets } = await ncc(__dirname + "/integration/" + integrationTest, { sourceMap: true });
    module.exports = null;
    sourceMapSources[integrationTest] = map;
    // integration tests will load assets relative to __dirname
    clearTmp();
    for (const asset of Object.keys(assets)) {
      const assetPath = __dirname + "/tmp/" + asset;
      mkdirp.sync(dirname(assetPath));
      fs.writeFileSync(assetPath, assets[asset]);
    }
    (__dirname => {
      try {
        eval(`${code}\n//# sourceURL=${integrationTest}`);
      }
      catch (e) {
        // useful for debugging
        mkdirp.sync(__dirname);
        fs.writeFileSync(__dirname + "/index.js", code);
        throw e;
      }
    })(__dirname + "/tmp");
    if ("function" !== typeof module.exports) {
      throw new Error(
        `Integration test "${integrationTest}" evaluation failed. It does not export a function`
      );
    }
    await module.exports();
  });
}

// remove me when node.js makes this the default behavior
process.on("unhandledRejection", e => {
  throw e;
});
