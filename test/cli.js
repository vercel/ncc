[
  {
    args: ["run", "test/integration/test.ts"],
    expect: { code: 0 }
  },
  {
    args: ["run", "--v8-cache", "test/integration/test.ts"],
    expect: { code: 0 }
  },
  {
    args: ["run", "test/fixtures/error.js"],
    expect: { code: 1 }
  },
  {
    args: ["run", "test/fixtures/does-not-exist.js"],
    expect: { code: 1 }
  },
  {
    args: ["run", "test/fixtures/error.js", "--no-source-map-register"],
    expect (code, stdout, stderr) {
      return code === 1 && stderr.toString().indexOf('fixtures/error.js') === -1;
    }
  },
  {
    args: ["run", "--watch", "test/integration/test.ts"],
    expect: { code: 2 }
  },
  {
    args: ["build", "-o", "tmp", "--watch", "test/fixtures/no-dep.js"],
    timeout: 500,
    expect: { timeout: true }
  },
  {
    args: ["run", "test/fixtures/fail.ts"],
    expect (code, stdout, stderr) {
      return code === 1 && stderr.toString().indexOf('fail.ts:2:1') !== -1;
    }
  }
]