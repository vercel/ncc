const os = require("os");
const fs = require("fs");
const path = require("path");
const coverage = global.coverage;

// the twilio test can take a while (large codebase)
jest.setTimeout(200000);

const skipOnWindows = [
  'binary-require.js',
  'browserify-middleware.js',
  'oracledb.js',
  'tensorflow.js',
]

const skipOnMacOS = [
  // https://github.com/Level/leveldown/issues/801
  'leveldown.js'
]

let nccRun;
if (coverage) {
  nccRun = require(__dirname + "/../src/cli.js");
}
else {
  nccRun = require(__dirname + "/../dist/ncc/cli.js");
}

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

for (const integrationTest of fs.readdirSync(__dirname + "/integration")) {
  // ignore e.g.: `.json` files
  if (!/\.(mjs|tsx?|js)$/.test(integrationTest)) continue;

  // disabled pending https://github.com/zeit/ncc/issues/141
  if (integrationTest.endsWith('loopback.js')) continue;

  // ignore a few tests known to fail on windows
  if (process.platform === 'win32' && skipOnWindows.includes(integrationTest)) continue;

  // ignore a few tests known to fail on macOS
  if (process.platform === 'darwin' && skipOnMacOS.includes(integrationTest)) continue;

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
      await nccRun(["run", "--no-cache", `${__dirname}/integration/${integrationTest}`], stdout, stderr);
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
    if (expectedStdout) {
      let stdoutStr = '';
      for (const chunk of stdout.data)
        stdoutStr += chunk.toString();
      expect(stdoutStr.startsWith(expectedStdout));
    }
  });
}

it(`should execute "ncc build web-vitals" with target config`, async () => {
  if (global.gc) global.gc();
  const stdout = new StoreStream();
  const stderr = new StoreStream();

  const tmpOut = path.join(os.tmpdir(), `ncc_${Math.random()}`)

  try {
    await nccRun(["build", "-o", tmpOut, "--target", "es5", require.resolve('web-vitals/dist/web-vitals.es5.min.js')], stdout, stderr);
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

  const outFile = path.join(tmpOut, 'index.js')
  const output = fs.readFileSync(outFile, 'utf8')

  // cleanup tmp output
  fs.unlinkSync(outFile)
  fs.rmdirSync(tmpOut)

  expect(output).toContain('function')
  // make sure es6 wrapper wasn't used
  expect(output).not.toContain('=>')

  await new Promise(resolve => setTimeout(resolve, 5000));
});

afterAll(() => {
  if (coverage)
    process.exit(0);
});

// remove me when node.js makes this the default behavior
process.on("unhandledRejection", e => {
  throw e;
});
