const fs = require("fs");
const ncc = global.coverage ? require("../src/index") : require("../");
const mkdirp = require("mkdirp");
const rimraf = require("rimraf");
const { dirname } = require("path");

for (const unitTest of fs.readdirSync(`${__dirname}/unit`)) {
  it(`should generate correct output for ${unitTest}`, async () => {
    const expected = fs
      .readFileSync(`${__dirname}/unit/${unitTest}/output.js`)
      .toString()
      .trim()
      // Windows support
      .replace(/\r/g, "");
    await ncc(`${__dirname}/unit/${unitTest}/input.js`, { minify: false }).then(
      async ({ code, assets }) => {
        // very simple asset validation in unit tests
        if (unitTest.startsWith("asset-")) {
          expect(Object.keys(assets).length).toBeGreaterThan(0);
          expect(assets[Object.keys(assets)[0]] instanceof Buffer);
        }
        const actual = code
          .trim()
          // Windows support
          .replace(/\r/g, "");
        try {
          expect(actual).toBe(expected);
        } catch (e) {
          // useful for updating fixtures
          fs.writeFileSync(`${__dirname}/unit/${unitTest}/actual.js`, actual);
          throw e;
        }
      }
    );
  });
}

// the twilio test can take a while (large codebase)
jest.setTimeout(100000);

function clearDir (dir) {
  try {
    rimraf.sync(dir);
  }
  catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
}

for (const integrationTest of fs.readdirSync(__dirname + "/integration")) {
  // ignore e.g.: `.json` files
  if (!/\.(mjs|tsx?|js)$/.test(integrationTest)) continue;

  // disabled pending https://github.com/zeit/ncc/issues/141
  if (integrationTest.endsWith('loopback.js')) continue;

  it(`should evaluate ${integrationTest} without errors`, async () => {
    const { code, map, assets } = await ncc(
      __dirname + "/integration/" + integrationTest
    );
    const tmpDir = `${__dirname}/tmp/${integrationTest}/`;
    clearDir(tmpDir);
    mkdirp.sync(tmpDir);
    for (const asset of Object.keys(assets)) {
      const assetPath = tmpDir + asset;
      mkdirp.sync(dirname(assetPath));
      fs.writeFileSync(assetPath, assets[asset]);
    }
    fs.writeFileSync(tmpDir + "index.js", code);
    fs.writeFileSync(tmpDir + "index.js.map", map);
    await new Promise((resolve, reject) => {
      const ps = require("child_process").fork(tmpDir + "index.js", {
        execArgv: ["-r", "source-map-support/register.js"]
      });
      ps.on("close", (code) => {
        if (code === 0)
          resolve();
        else
          reject(new Error(`Test failed.`));
      });
    });
    clearDir(tmpDir);
  });
}

// remove me when node.js makes this the default behavior
process.on("unhandledRejection", e => {
  throw e;
});
