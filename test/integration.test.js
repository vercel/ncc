const os = require("os");
const fs = require("fs");
const path = require("path");
const { fork } = require("child_process");
const coverage = global.coverage;

for (const cliTest of eval(fs.readFileSync(__dirname + "/cli.js").toString())) {
  it(`should execute "ncc ${(cliTest.args || []).join(" ")}"`, async () => {
    const ps = fork(__dirname + (coverage ? "/../src/cli.js" : "/../dist/ncc/cli.js"), cliTest.args || [], {
      stdio: "pipe",
      env: { ...process.env, ...cliTest.env },
    });
    let stderr = "", stdout = "";
    ps.stderr.on("data", chunk => stderr += chunk.toString());
    ps.stdout.on("data", chunk => stdout += chunk.toString());
    const expected = cliTest.expect || { code: 0 };
    let timedOut = false;
    if (cliTest.timeout)
      setTimeout(() => {
        timedOut = true;
        ps.kill();
      }, cliTest.timeout);
    const code = await new Promise(resolve => ps.on("close", resolve));
    if (typeof expected === "function")
      expect(expected(code, stdout, stderr, timedOut)).toBe(true);
    else {
      if ("code" in expected)
        expect(code).toBe(expected.code);
      if ("timeout" in expected)
        expect(timedOut).toBe(true);
    }
  });
}

// the twilio test can take a while (large codebase)
jest.setTimeout(200000);

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
      await nccRun(["run", "--no-cache", "--no-asset-builds", `${__dirname}/integration/${integrationTest}`], stdout, stderr);
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
});

// remove me when node.js makes this the default behavior
process.on("unhandledRejection", e => {
  throw e;
});
