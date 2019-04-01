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
  }
]