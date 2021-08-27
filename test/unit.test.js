const fs = require("fs");
const coverage = global.coverage;
const ncc = coverage ? require("../src/index") : require("../");

jest.setTimeout(20000);

for (const unitTest of fs.readdirSync(`${__dirname}/unit`)) {
  it(`should generate correct output for ${unitTest}`, async () => {
    const testDir = `${__dirname}/unit/${unitTest}`;
    const expected = fs
      .readFileSync(`${testDir}/output${coverage ? '-coverage' : ''}.js`)
      .toString()
      .trim()
      // Windows support
      .replace(/\r/g, "");
    let expectedSourceMap;
    try {
      expectedSourceMap = fs
        .readFileSync(`${testDir}/output${coverage ? '-coverage' : ''}.js.map`)
        .toString()
        .trim()
        // Windows support
        .replace(/\r/g, "");
    } catch (_) {}

    let opts;
    try {
      opts = fs.readFileSync(`${testDir}/opt.json`, 'utf8');
      opts = JSON.parse(opts);
    } catch (_) {}

    // set env variable so tsconfig-paths can find the config
    process.env.TS_NODE_PROJECT = `${testDir}/tsconfig.json`;
    // find the name of the input file (e.g input.ts)
    const inputFile = fs.readdirSync(testDir).find(file => file.includes("input"));
    await ncc(`${testDir}/${inputFile}`, Object.assign({
      assetBuilds: true,
      transpileOnly: true,
      customEmit (path) {
        if (path.endsWith('test.json'))
          return false;
      },
      externals: {
        'piscina': 'piscina',
        'externaltest': 'externalmapped',
        '/\\w+-regex/': 'regexexternal',
      }
    }, opts)).then(
      async ({ code, assets, map }) => {
        if (unitTest.startsWith('bundle-subasset')) {
          expect(assets['pi-bridge.js']).toBeDefined();
          expect(assets['pi-bridge.js'].source.toString()).toContain('Math.PI');
        }
        const actual = code
          .trim()
          // Windows support
          .replace(/\r/g, "")
          .replace(/;+/g, ";");
        try {
          expect(actual).toBe(expected);
        } catch (e) {
          // useful for updating fixtures
          fs.writeFileSync(`${testDir}/actual.js`, actual);
          throw e;
        }

        if (map) {
          const actualSourceMap = map
            .trim()
            // Windows support
            .replace(/\r/g, "");
          try {
            expect(actualSourceMap).toBe(expectedSourceMap);
          } catch (e) {
            // useful for updating fixtures
            fs.writeFileSync(`${testDir}/actual.js.map`, actualSourceMap);
            throw e;
          }
        }
      }
    )
  });
}

