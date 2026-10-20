const { expandDirnameShorthand } = require("../src/loaders/expand-shorthand-loader");

describe("expandDirnameShorthand", () => {
  it("expands ngrok-style shorthand exports of a dirname join", () => {
    const input = [
      'const { join } = require("path");',
      'const defaultDir = join(__dirname, "..", "bin");',
      'const bin = "ngrok";',
      "module.exports = {",
      "  defaultDir,",
      "  bin,",
      "};",
      "",
    ].join("\n");

    expect(expandDirnameShorthand(input)).toBe(
      [
        'const { join } = require("path");',
        'const defaultDir = join(__dirname, "..", "bin");',
        'const bin = "ngrok";',
        "module.exports = {",
        "  defaultDir:defaultDir,",
        "  bin,",
        "};",
        "",
      ].join("\n")
    );
  });

  it("leaves files without dirname bindings unchanged", () => {
    const input = "module.exports = { bin, ready };\n";
    expect(expandDirnameShorthand(input)).toBe(input);
  });

  it("does not rewrite explicit key: value exports", () => {
    const input = [
      'const defaultDir = join(__dirname, "bin");',
      "module.exports = {",
      "  defaultDir: otherDir,",
      "};",
      "",
    ].join("\n");
    expect(expandDirnameShorthand(input)).toBe(input);
  });
});
