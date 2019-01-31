const fs = require("fs");
const ncc = global.coverage ? require("../src/index") : require("../");

for (const unitTest of fs.readdirSync(`${__dirname}/unit`)) {
  it(`should generate correct output for ${unitTest}`, async () => {
    const testDir = `${__dirname}/unit/${unitTest}`;
    const expected = fs
      .readFileSync(`${testDir}/output${global.coverage ? '-coverage' : ''}.js`)
      .toString()
      .trim()
      // Windows support
      .replace(/\r/g, "");

    // set env variable so tsconfig-paths can find the config
    process.env.TS_NODE_PROJECT = `${testDir}/tsconfig.json`;
    // find the name of the input file (e.g input.ts)
    const inputFile = fs.readdirSync(testDir).find(file => file.includes("input"));
    await ncc(`${testDir}/${inputFile}`).then(
      async ({ code, assets }) => {
        const actual = code
          .trim()
          // Windows support
          .replace(/\r/g, "");
        try {
          expect(actual).toBe(expected);
        } catch (e) {
          // useful for updating fixtures
          fs.writeFileSync(`${testDir}/actual.js`, actual);
          throw e;
        }

        // very simple asset validation in unit tests
        if (unitTest.startsWith("asset-")) {
          expect(Object.keys(assets).length).toBeGreaterThan(0);
          expect(assets[Object.keys(assets)[0].source] instanceof Buffer);
        }
      }
    );
  });
}

// the twilio test can take a while (large codebase)
jest.setTimeout(200000);

let nccRun;
if (global.coverage) {
  nccRun = require(__dirname + "/../src/cli.js");
}
else {
  nccRun = require(__dirname + "/../dist/ncc/cli.js");
}

for (const integrationTest of fs.readdirSync(__dirname + "/integration")) {
  // ignore e.g.: `.json` files
  if (!/\.(mjs|tsx?|js)$/.test(integrationTest)) continue;

  // disabled pending https://github.com/zeit/ncc/issues/141
  if (integrationTest.endsWith('loopback.js')) continue;

  const { Writable } = require('stream');
  class StoreStream extends Writable {
    constructor (options) {
      super(options);
      this.data = [];
    }
    _write(chunk, encoding, callback) {
      this.data.push(chunk);
      callback();
    }
  }

  it(`should execute "ncc run ${integrationTest}"`, async () => {
    let expectedStdout;
    try {
      expectedStdout = fs.readFileSync(`${__dirname}/integration/${integrationTest}.stdout`).toString();
    }
    catch (e) {}
    if (global.gc) global.gc();
    const stdout = new StoreStream();
    const stderr = new StoreStream();
    try {
      await nccRun(["run", "-f", `${__dirname}/integration/${integrationTest}`], stdout, stderr);
    }
    catch (e) {
      if (e.silent) {
        let lastErr = stderr.data[stderr.data.length - 1];
        if (lastErr)
          throw new Error(lastErr);
        else
          throw new Error('Process exited with code ' + e.exitCode);
      }
      throw e;
    }
    stderr.data.forEach(chunk => {
      if (chunk.toString().startsWith('(node:')) return;
      throw new Error(chunk.toString());
    });
    if (expectedStdout) {
      let stdoutStr = '';
      for (const chunk of stdout.data)
        stdoutStr += chunk.toString();
      expect(stdoutStr.startsWith(expectedStdout));
    }
  });
}

// remove me when node.js makes this the default behavior
process.on("unhandledRejection", e => {
  throw e;
});
