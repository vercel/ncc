const fs = require("fs");
const { fork } = require("child_process");
const coverage = global.coverage;

jest.setTimeout(20000);

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
