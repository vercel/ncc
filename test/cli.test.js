const { fork } = require("child_process");
const { join } = require("path");
const cliTests = require("./cli.js");
const file = global.coverage ? "/../src/cli.js" : "/../dist/ncc/cli.js";

jest.setTimeout(20000);

describe('cli', () => {
  it.each(cliTests)('should execute ncc $args', async ({ args, env, expect: e, timeout }) => {

    const ps = fork(join(__dirname, file), args || [], {
      stdio: "pipe",
      env: { ...process.env, ...env },
    });
    let stderr = "", stdout = "";
    ps.stderr.on("data", chunk => stderr += chunk.toString());
    ps.stdout.on("data", chunk => stdout += chunk.toString());
    const expected = e ?? { code: 0 };
    let timedOut = false;
    if (timeout)
      setTimeout(() => {
        timedOut = true;
        ps.kill();
      }, timeout);
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
});
