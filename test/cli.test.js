const { fork } = require("child_process");
const { cpSync, mkdtempSync, rmSync } = require("fs");
const { tmpdir } = require("os");
const { join } = require("path");
const cliTests = require("./cli.js");
const file = global.coverage ? "/../src/cli.js" : "/../dist/ncc/cli.js";

jest.setTimeout(20000);

for (const cliTest of cliTests) {
  it(`should execute "ncc ${(cliTest.args || []).join(" ")}"`, async () => {
    const ps = fork(join(__dirname, file), cliTest.args || [], {
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

// only the dist build has a bundled typescript to fall back to
if (!global.coverage) {
  it("should use the built-in typescript when typescript is not installed", async () => {
    // run a copy of the build from outside the repo, so that (as with a global
    // install) typescript can't be resolved from ncc's own location either
    const dir = mkdtempSync(join(tmpdir(), "ncc-"));
    cpSync(join(__dirname, "../dist/ncc"), dir, { recursive: true });
    const ps = fork(join(dir, "cli.js"), ["build", "test/integration/test.ts", "-o", join(dir, "out")], {
      stdio: "pipe",
      env: { ...process.env, TYPESCRIPT_LOOKUP_PATH: "/tmp/nowhere" },
    });
    let stderr = "", stdout = "";
    ps.stderr.on("data", chunk => stderr += chunk.toString());
    ps.stdout.on("data", chunk => stdout += chunk.toString());
    const code = await new Promise(resolve => ps.on("close", resolve));
    rmSync(dir, { recursive: true, force: true });
    if (code !== 0)
      throw new Error(`ncc exited with code ${code}:\n${stderr}`);
    expect(stdout).toContain("ncc built-in");
  });
}
