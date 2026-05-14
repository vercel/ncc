const fs = require("fs");
const path = require("path");
const coverage = global.coverage;
const ncc = coverage ? require("../src/index") : require("../");

jest.setTimeout(20000);

function normalizeForWindows(str) {
  return str.trim().replace(/\\r/g, '').replace(/\r/g, '').replace(/;+/g, ';');
}

for (const unitTest of fs.readdirSync(`${__dirname}/unit`)) {
  if (process.platform === 'win32' && unitTest.includes('shebang')) {
    continue;
  }
  it(`should generate correct output for ${unitTest}`, async () => { 
    const testDir = `${__dirname}/unit/${unitTest}`;
    const expected = normalizeForWindows(fs.readFileSync(`${testDir}/output${coverage ? '-coverage' : ''}.js`, 'utf8'));
    let expectedSourceMap;
    try {
      expectedSourceMap = normalizeForWindows(fs.readFileSync(`${testDir}/output${coverage ? '-coverage' : ''}.js.map`, 'utf8'));
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
        '/external-replace(/.*)/': 'external-replace/replaced$1'
      }
    }, opts)).then(
      async ({ code, assets, map }) => {
        if (unitTest.startsWith('bundle-subasset')) {
          expect(assets['pi-bridge.js']).toBeDefined();
          expect(assets['pi-bridge.js'].source.toString()).toContain('Math.PI');
        }
        if (unitTest.includes('sourcemap-register')) {
          expect(assets['sourcemap-register.js']).toBeDefined()
          expect(assets['sourcemap-register.js'].source.toString()).toEqual(fs.readFileSync(__dirname + '/../src/sourcemap-register.js.cache.js').toString())
        }
        if (unitTest.includes('minify') && !unitTest.includes('minify-err')) {
          expect(assets['index.js.map']).toBeDefined()
        }
        const actual = normalizeForWindows(code);
        try {
          expect(actual).toBe(expected);
        } catch (e) {
          // useful for updating fixtures
          fs.writeFileSync(`${testDir}/actual.js`, actual);
          throw e;
        }

        if (map) {
          const actualSourceMap = normalizeForWindows(map);
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

async function expectEsmOnlyTypeScriptBuild(compilerOptions) {
  const testDir = fs.mkdtempSync(path.join(__dirname, "tmp-esm-ts-cjs-"));
  const prevTsNodeProject = process.env.TS_NODE_PROJECT;

  try {
    fs.writeFileSync(`${testDir}/package.json`, JSON.stringify({
      type: "module"
    }));
    fs.writeFileSync(`${testDir}/tsconfig.json`, JSON.stringify({
      compilerOptions
    }));

    const packageDir = `${testDir}/node_modules/esm-only-condition-package`;
    fs.mkdirSync(packageDir, { recursive: true });
    fs.writeFileSync(`${packageDir}/package.json`, JSON.stringify({
      name: "esm-only-condition-package",
      type: "module",
      exports: {
        ".": {
          types: "./index.d.ts",
          import: "./index.js"
        }
      }
    }));
    fs.writeFileSync(`${packageDir}/index.js`, "export const value = 'from-esm-only-package';\n");
    fs.writeFileSync(`${packageDir}/index.d.ts`, "export declare const value: string;\n");
    fs.writeFileSync(
      `${testDir}/input.ts`,
      "import { value } from 'esm-only-condition-package';\nconsole.log(value);\n"
    );

    process.env.TS_NODE_PROJECT = `${testDir}/tsconfig.json`;

    const { code } = await ncc(`${testDir}/input.ts`, {
      cache: false,
      quiet: true,
      transpileOnly: true
    });

    expect(code).toContain("from-esm-only-package");
  } finally {
    if (prevTsNodeProject === undefined)
      delete process.env.TS_NODE_PROJECT;
    else
      process.env.TS_NODE_PROJECT = prevTsNodeProject;

    fs.rmSync(testDir, { recursive: true, force: true });
  }
}

it("preserves TypeScript imports for ESM builds when tsconfig emits CommonJS", async () => {
  await expectEsmOnlyTypeScriptBuild({
    module: "CommonJS",
    target: "ES2020"
  });
});
