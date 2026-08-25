const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { Writable } = require("stream");

const ncc = require("../src/index");
const runCmd = require("../src/cli");
const formatCompilationErrors = require("../src/utils/format-compilation-errors");
const isResolverNotFoundError = require("../src/utils/is-resolver-not-found-error");
const missingDependencyPaths = require("../src/utils/missing-dependency-paths");
const nodeModulesCandidates = require("../src/utils/node-modules-candidates");
const relocateLoader = require("../src/loaders/relocate-loader");
const tsLoader = require("../src/loaders/ts-loader");

jest.setTimeout(20000);

// A child that never exits would block the suite for the whole job timeout,
// because execFileSync cannot be interrupted by the per-test timeout.
function runNode(...args) {
  return execFileSync(process.execPath, args, { encoding: "utf8", timeout: 15000 });
}

class StoreStream extends Writable {
  constructor() {
    super();
    this.data = "";
  }

  _write(chunk, encoding, callback) {
    this.data += chunk.toString();
    callback();
  }
}

function createWatchFileSystem(onWatch) {
  return {
    watch(...args) {
      onWatch(...args);
      return {
        close() {},
        pause() {},
        getInfo: () => ({
          changes: new Set(),
          removals: new Set(),
          fileTimeInfoEntries: new Map(),
          contextTimeInfoEntries: new Map()
        })
      };
    }
  };
}

async function runWatchedBuild(input, options, onWatch) {
  const watcher = ncc(input, {
    cache: false,
    quiet: true,
    ...options,
    watch: createWatchFileSystem(onWatch)
  });
  const result = await new Promise((resolve, reject) => {
    watcher.handler(value => value.err ? reject(value.err) : resolve(value));
  });
  await new Promise(resolve => setImmediate(resolve));
  watcher.close();
  return result;
}

describe("review regressions", () => {
  let tmpDir;

  beforeEach(() => {
    // The compilation records the resolver's real paths, while os.tmpdir() is a
    // symlink on macOS (/var -> /private/var) and an 8.3 short name on Windows,
    // so paths built from it directly would never match what was registered.
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ncc-review-")));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("preserves ncc run child exit details in API mode", async () => {
    const input = path.join(tmpDir, "exit.js");
    fs.writeFileSync(input, "process.exit(7);\n");
    const stdout = new StoreStream();
    const stderr = new StoreStream();

    await expect(runCmd(["run", "--no-cache", input], stdout, stderr)).rejects.toMatchObject({
      silent: true,
      exitCode: 7
    });
    expect(stderr.data).toBe("");
  });

  it("evicts a module from the cache when its factory throws", async () => {
    const flaky = path.join(tmpDir, "flaky.js");
    fs.writeFileSync(flaky, [
      "global.__nccModuleAttempts = (global.__nccModuleAttempts || 0) + 1;",
      "if (global.__nccModuleAttempts === 1) throw new Error('first attempt');",
      "module.exports = 'recovered';"
    ].join("\n"));
    const input = path.join(tmpDir, "entry.js");
    fs.writeFileSync(input, [
      "try { require('./flaky'); } catch (error) {}",
      "module.exports = require('./flaky');"
    ].join("\n"));

    const { code } = await ncc(input, { cache: false, quiet: true });
    const output = path.join(tmpDir, "output.js");
    fs.writeFileSync(output, code);

    expect(require(output)).toBe("recovered");
    expect(global.__nccModuleAttempts).toBe(2);
    delete global.__nccModuleAttempts;
  });

  it("does not rewrite module-cache-like user code", async () => {
    const input = path.join(tmpDir, "entry.js");
    fs.writeFileSync(input, [
      "// The require function",
      "const cachedModule = { error: new Error('user error') };",
      "let caught = false;",
      "try {",
      "  if (cachedModule.error !== undefined) throw cachedModule.error;",
      "} catch (error) {",
      "  caught = error.message === 'user error';",
      "}",
      "module.exports = caught;"
    ].join("\n"));

    const { code } = await ncc(input, { cache: false, quiet: true });
    const output = path.join(tmpDir, "output.js");
    fs.writeFileSync(output, code);

    expect(require(output)).toBe(true);
  });

  it("uses dependency conditions when probing ESM package exports", async () => {
    const packageDir = path.join(tmpDir, "node_modules", "import-only");
    fs.mkdirSync(packageDir, { recursive: true });
    fs.writeFileSync(path.join(packageDir, "package.json"), JSON.stringify({
      name: "import-only",
      type: "module",
      exports: {
        ".": {
          import: "./import.js"
        }
      }
    }));
    fs.writeFileSync(path.join(packageDir, "import.js"), "export default 'conditional-import-ok';\n");
    const input = path.join(tmpDir, "entry.mjs");
    fs.writeFileSync(input, "import value from 'import-only'; console.log(value);\n");

    const { code } = await ncc(input, { cache: false, esm: true, quiet: true });
    const output = path.join(tmpDir, "output.mjs");
    fs.writeFileSync(output, code);
    const result = runNode(output);

    expect(result.trim()).toBe("conditional-import-ok");
  });

  it("tries ESM conditions for dynamic import from a CommonJS issuer", async () => {
    const packageDir = path.join(tmpDir, "node_modules", "import-only");
    fs.mkdirSync(packageDir, { recursive: true });
    fs.writeFileSync(path.join(packageDir, "package.json"), JSON.stringify({
      name: "import-only",
      type: "module",
      exports: {
        ".": {
          import: "./import.js"
        }
      }
    }));
    fs.writeFileSync(path.join(packageDir, "import.js"), "export default 'dynamic-import-ok';\n");
    const input = path.join(tmpDir, "entry.cjs");
    fs.writeFileSync(input, "import('import-only').then(value => console.log(value.default));\n");

    const { code, assets } = await ncc(input, { cache: false, quiet: true });
    const output = path.join(tmpDir, "output.cjs");
    fs.writeFileSync(output, code);
    for (const [name, asset] of Object.entries(assets)) {
      const assetPath = path.join(tmpDir, name);
      fs.mkdirSync(path.dirname(assetPath), { recursive: true });
      fs.writeFileSync(assetPath, asset.source);
    }
    const result = runNode(output);

    expect(result.trim()).toBe("dynamic-import-ok");
  });

  it("tries CommonJS conditions for require from a TypeScript issuer", async () => {
    const packageDir = path.join(tmpDir, "node_modules", "require-only");
    fs.mkdirSync(packageDir, { recursive: true });
    fs.writeFileSync(path.join(packageDir, "package.json"), JSON.stringify({
      name: "require-only",
      exports: {
        ".": {
          require: "./require.js"
        }
      }
    }));
    fs.writeFileSync(path.join(packageDir, "require.js"), "module.exports = 'require-ok';\n");
    const input = path.join(tmpDir, "entry.ts");
    fs.writeFileSync(input, "console.log(require('require-only'));\n");

    const { code } = await ncc(input, { cache: false, quiet: true, transpileOnly: true });
    const output = path.join(tmpDir, "output.js");
    fs.writeFileSync(output, code);
    const result = runNode(output);

    expect(result.trim()).toBe("require-ok");
  });

  it("reports TypeScript syntax errors in transpile-only mode", async () => {
    const input = path.join(tmpDir, "entry.ts");
    fs.writeFileSync(input, "const value: = 1;\n");

    await expect(ncc(input, {
      cache: false,
      quiet: true,
      transpileOnly: true
    })).rejects.toThrow(/TS1110/);
  });

  it("preserves whole-program TypeScript emit semantics", async () => {
    fs.writeFileSync(path.join(tmpDir, "globals.d.ts"), [
      "declare const enum Level {",
      "  High = 2",
      "}"
    ].join("\n"));
    fs.writeFileSync(path.join(tmpDir, "types.ts"), "export interface Widget { value: string }\n");
    const input = path.join(tmpDir, "entry.ts");
    fs.writeFileSync(input, [
      "/// <reference path=\"./globals.d.ts\" />",
      "export { Widget } from './types';",
      "console.log(Level.High);"
    ].join("\n"));

    const { code } = await ncc(input, { cache: false, quiet: true });
    const output = path.join(tmpDir, "output.js");
    fs.writeFileSync(output, code);
    const runner = path.join(tmpDir, "runner.js");
    fs.writeFileSync(runner, [
      `const value = require(${JSON.stringify(output)});`,
      "console.log('widget:' + ('Widget' in value));"
    ].join("\n"));
    const result = runNode(runner);

    expect(result.trim().split("\n")).toEqual(["2", "widget:false"]);
  });

  it("discovers and tracks a tsconfig outside the current working directory", async () => {
    const sourceDir = path.join(tmpDir, "src");
    fs.mkdirSync(sourceDir);
    const tsconfig = path.join(tmpDir, "tsconfig.json");
    fs.writeFileSync(tsconfig, JSON.stringify({
      compilerOptions: {
        baseUrl: ".",
        paths: {
          "@value": ["src/value"]
        }
      }
    }));
    fs.writeFileSync(path.join(sourceDir, "value.ts"), "export default 'tsconfig-ok';\n");
    const input = path.join(sourceDir, "entry.ts");
    fs.writeFileSync(input, "import value from '@value'; console.log(value);\n");

    let watchedFiles;
    const previousProject = process.env.TS_NODE_PROJECT;
    delete process.env.TS_NODE_PROJECT;
    try {
      const result = await runWatchedBuild(
        input,
        { transpileOnly: true },
        files => {
          watchedFiles = new Set(files);
        }
      );
      const output = path.join(tmpDir, "output.js");
      fs.writeFileSync(output, result.code);

      expect(runNode(output).trim()).toBe("tsconfig-ok");
      expect(watchedFiles).toBeDefined();
      expect([...watchedFiles]).toContain(tsconfig);
    } finally {
      if (previousProject === undefined) {
        delete process.env.TS_NODE_PROJECT;
      } else {
        process.env.TS_NODE_PROJECT = previousProject;
      }
    }
  });

  it("tries URL resolution options for bare relative assets", async () => {
    const input = path.join(tmpDir, "entry.mjs");
    fs.writeFileSync(input, "export default new URL('asset.txt', import.meta.url);\n");
    fs.writeFileSync(path.join(tmpDir, "asset.txt"), "asset-ok\n");

    const { assets } = await ncc(input, { cache: false, esm: true, quiet: true });

    expect(Object.values(assets).some(asset => asset.source.toString() === "asset-ok\n")).toBe(true);
  });

  it("derives the paths whose creation would resolve a missed request", () => {
    const context = path.join(tmpDir, "src");
    fs.mkdirSync(context);

    const relative = missingDependencyPaths("./later?query", context, [".js", ".ts"]);
    expect(relative).toEqual(expect.arrayContaining([
      path.join(context, "later"),
      path.join(context, "later.js"),
      path.join(context, "later.ts")
    ]));

    const bare = missingDependencyPaths("future-pkg/deep/file.js", context, [".js"]);
    expect(bare).toContain(path.join(context, "node_modules"));

    const packageDir = path.join(tmpDir, "node_modules", "existing-package");
    fs.mkdirSync(packageDir, { recursive: true });
    fs.writeFileSync(path.join(packageDir, "package.json"), JSON.stringify({
      name: "existing-package",
      exports: {
        "./future": "./generated/future.js"
      }
    }));
    expect(missingDependencyPaths("existing-package/future", context, [".js"])).toContain(
      path.join(packageDir, "package.json")
    );
    expect(missingDependencyPaths("existing-package/future", context, [".js"])).toContain(
      path.join(packageDir, "generated")
    );

    // Registering a path under a directory that does not exist yet would make
    // rspack watch a far ancestor recursively, so every path stops one segment
    // past the deepest directory that exists.
    for (const candidate of [...relative, ...bare])
      expect(fs.existsSync(path.dirname(candidate))).toBe(true);

    fs.writeFileSync(path.join(tmpDir, "package.json"), JSON.stringify({
      imports: {
        "#future": "./generated/future.js",
        "#external": "optional-dependency",
        "#external-missing": "not-installed",
        "#a*/very-long": "./short-prefix/*",
        "#abcdef*": "./long-prefix/*"
      }
    }));
    expect(missingDependencyPaths("#future", context, [".js"])).toContain(
      path.join(tmpDir, "package.json")
    );
    expect(missingDependencyPaths("#future", context, [".js"])).toContain(
      path.join(tmpDir, "generated")
    );
    const externalPackageDir = path.join(
      tmpDir,
      "node_modules",
      "optional-dependency"
    );
    fs.mkdirSync(externalPackageDir);
    fs.writeFileSync(path.join(externalPackageDir, "package.json"), JSON.stringify({
      exports: "./generated/value.js"
    }));
    expect(missingDependencyPaths("#external", context, [".js"])).toContain(
      path.join(externalPackageDir, "generated")
    );
    expect(missingDependencyPaths("#external-missing", context, [".js"])).toContain(
      path.join(tmpDir, "node_modules", "not-installed")
    );
    const wildcardTargets = missingDependencyPaths(
      "#abcdef-value/very-long",
      context,
      [".js"]
    );
    expect(wildcardTargets).toContain(path.join(tmpDir, "short-prefix"));
    expect(wildcardTargets).toContain(path.join(tmpDir, "long-prefix"));
    expect(missingDependencyPaths("data:text/javascript,0", context, [".js"])).toEqual([]);
  });

  // "ncc run" links the nearest node_modules into its temporary output
  // directory. Stopping that walk at resolve("/node_modules") hung on Windows
  // whenever the input was on a different drive than the working directory,
  // because resolve picks up the working directory's drive: walking up from the
  // input reached the other drive's root and stayed there forever.
  it("stops the node_modules walk at the root of a path on any platform", () => {
    expect(nodeModulesCandidates("/tmp/ncc-review-abc", path.posix)).toEqual([
      "/tmp/ncc-review-abc/node_modules",
      "/tmp/node_modules"
    ]);
    expect(nodeModulesCandidates("/", path.posix)).toEqual([]);

    expect(nodeModulesCandidates("C:\\Users\\runner\\AppData\\Local\\Temp\\x", path.win32)).toEqual([
      "C:\\Users\\runner\\AppData\\Local\\Temp\\x\\node_modules",
      "C:\\Users\\runner\\AppData\\Local\\Temp\\node_modules",
      "C:\\Users\\runner\\AppData\\Local\\node_modules",
      "C:\\Users\\runner\\AppData\\node_modules",
      "C:\\Users\\runner\\node_modules",
      "C:\\Users\\node_modules"
    ]);
    expect(nodeModulesCandidates("C:\\", path.win32)).toEqual([]);
    expect(nodeModulesCandidates("\\\\server\\share\\project", path.win32)).toEqual([
      "\\\\server\\share\\project\\node_modules"
    ]);
    expect(nodeModulesCandidates("\\\\server\\share", path.win32)).toEqual([]);

    expect(nodeModulesCandidates(tmpDir)).toContain(path.join(tmpDir, "node_modules"));
  });

  it("registers missing dependencies with the watcher for a rewritten request", async () => {
    const input = path.join(tmpDir, "entry.js");
    fs.writeFileSync(input, "module.exports = require('./later');\n");

    let watched;
    await runWatchedBuild(input, {}, (_files, _dirs, missing) => {
      watched = new Set(missing);
    });

    expect(watched).toBeDefined();
    expect([...watched]).toContain(path.join(tmpDir, "later.js"));
  });

  it("watches a package scope for a missing imports target", async () => {
    fs.writeFileSync(path.join(tmpDir, "package.json"), JSON.stringify({
      type: "module",
      imports: {
        "#future": "./generated/future.js"
      }
    }));
    const input = path.join(tmpDir, "entry.mjs");
    fs.writeFileSync(input, "import '#future';\n");

    let watchedMissing;
    await runWatchedBuild(input, { esm: true }, (_files, _dirs, missing) => {
      watchedMissing = new Set(missing);
    });

    expect(watchedMissing).toBeDefined();
    expect([...watchedMissing]).toContain(path.join(tmpDir, "generated"));
  });

  it("does not ignore bundled node_modules changes in watch mode", async () => {
    const packageDir = path.join(tmpDir, "node_modules", "watched-dependency");
    fs.mkdirSync(packageDir, { recursive: true });
    fs.writeFileSync(path.join(packageDir, "package.json"), JSON.stringify({
      name: "watched-dependency",
      main: "index.js"
    }));
    fs.writeFileSync(path.join(packageDir, "index.js"), "module.exports = 1;\n");
    const input = path.join(tmpDir, "entry.js");
    fs.writeFileSync(input, "module.exports = require('watched-dependency');\n");

    let watchOptions;
    await runWatchedBuild(input, {}, (_files, _dirs, _missing, _startTime, options) => {
      watchOptions = options;
    });

    expect(watchOptions).toBeDefined();
    expect(watchOptions.ignored).toEqual([]);
  });

  it("watches the TypeScript fallback for a missing .js request", async () => {
    const input = path.join(tmpDir, "entry.ts");
    fs.writeFileSync(input, "require('./later.js');\n");

    let watched;
    await runWatchedBuild(
      input,
      { transpileOnly: true },
      (_files, _dirs, missing) => {
        watched = new Set(missing);
      }
    );

    expect(watched).toBeDefined();
    expect([...watched]).toContain(path.join(tmpDir, "later.ts"));
  });

  it("classifies known resolver misses without broad substring matching", () => {
    expect(isResolverNotFoundError({ code: "MODULE_NOT_FOUND" })).toBe(true);
    expect(isResolverNotFoundError({ name: "ModuleNotFoundError" })).toBe(true);
    expect(isResolverNotFoundError({ message: 'RspackResolver(NotFound("./missing"))' })).toBe(true);
    expect(isResolverNotFoundError({ message: 'RspackResolver(MatchedAliasNotFound("x"))' })).toBe(true);
    expect(isResolverNotFoundError({ message: 'RspackResolver(ExtensionAlias("x"))' })).toBe(true);
    expect(isResolverNotFoundError({ message: "RspackResolver(JsonError(\"bad package\"))" })).toBe(false);
    expect(isResolverNotFoundError({ message: "NotFound appeared in unrelated text" })).toBe(false);
  });

  it("keeps the original compilation message when every line looks like a stack frame", () => {
    expect(formatCompilationErrors([{ message: "at first\nat second" }])).toBe("at first\nat second");
    expect(formatCompilationErrors([{ message: "useful message\n    at first" }])).toBe("useful message");
  });

  it("passes JSON through before the relocator reads its uninitialized code variable", async () => {
    const result = await new Promise((resolve, reject) => {
      relocateLoader.call({
        resourcePath: path.join(tmpDir, "data.json"),
        async() {
          return (err, content, map) => err ? reject(err) : resolve({ content, map });
        }
      }, Buffer.from('{"value":true}'), { version: 3 });
    });

    expect(result).toEqual({
      content: '{"value":true}',
      map: { version: 3 }
    });
  });

  it("reports a TypeScript config diagnostic once per compilation", async () => {
    const errors = [];
    const compilation = {
      errors,
      hooks: {
        finishModules: {
          tap() {}
        }
      }
    };
    const load = resourcePath => new Promise((resolve, reject) => {
      tsLoader.call({
        _compilation: compilation,
        resourcePath,
        sourceMap: false,
        cacheable() {},
        getOptions() {
          return {
            compiler: require("typescript"),
            compilerOptions: { target: "definitely-invalid" },
            configFileDirectory: tmpDir,
            transpileOnly: true
          };
        },
        async() {
          return err => err ? reject(err) : resolve();
        },
        emitError(error) {
          errors.push(error);
        }
      }, Buffer.from("export const value = 1;"));
    });

    await load(path.join(tmpDir, "a.ts"));
    await load(path.join(tmpDir, "b.ts"));

    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain("TS6046");
  });

  it("reports TypeScript warnings without failing the compilation", async () => {
    const finishModules = [];
    const warnings = [];
    const compilation = {
      errors: [],
      warnings,
      hooks: {
        finishModules: {
          tap(_name, handler) {
            finishModules.push(handler);
          }
        }
      }
    };
    const warning = {
      category: 0,
      code: 9999,
      messageText: "warning only"
    };
    const typescript = {
      DiagnosticCategory: { Warning: 0, Error: 1 },
      sys: { newLine: "\n" },
      convertCompilerOptionsFromJson(options) {
        return { options, errors: [] };
      },
      flattenDiagnosticMessageText(message) {
        return String(message);
      },
      formatDiagnostics(diagnostics) {
        return diagnostics.map(diagnostic => diagnostic.messageText).join("\n");
      },
      createCompilerHost() {
        return {};
      },
      createProgram() {
        return {
          getSourceFile(fileName) {
            return { fileName };
          },
          emit(_sourceFile, writeFile) {
            writeFile(path.join(tmpDir, "entry.js"), "");
            return { diagnostics: [warning] };
          }
        };
      },
      getPreEmitDiagnostics() {
        return [warning];
      }
    };

    await new Promise((resolve, reject) => {
      tsLoader.call({
        _compilation: compilation,
        resourcePath: path.join(tmpDir, "entry.ts"),
        sourceMap: false,
        cacheable() {},
        getOptions() {
          return {
            compiler: typescript,
            compilerOptions: {},
            configFileDirectory: tmpDir
          };
        },
        async() {
          return err => err ? reject(err) : resolve();
        },
        emitError: reject,
        emitWarning(error) {
          warnings.push(error);
        }
      }, Buffer.from("export default 1;"));
    });

    finishModules[0]();
    expect(compilation.errors).toHaveLength(0);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].message).toContain("warning only");
  });

  it("emits TypeScript declarations once from the shared program", async () => {
    const finishModules = [];
    const emitted = new Map();
    const compilation = {
      errors: [],
      emitAsset(name, source) {
        emitted.set(name, source.source());
      },
      hooks: {
        finishModules: {
          tap(_name, handler) {
            finishModules.push(handler);
          }
        }
      }
    };
    const resourcePath = path.join(tmpDir, "source.ts");
    fs.writeFileSync(resourcePath, "export function value(input: string): string { return input; }\n");

    await new Promise((resolve, reject) => {
      tsLoader.call({
        _compilation: compilation,
        resourcePath,
        sourceMap: false,
        cacheable() {},
        getOptions() {
          return {
            compiler: require("typescript"),
            compilerOptions: {
              declaration: true,
              declarationDir: path.join(tmpDir, "types"),
              module: "esnext",
              target: "esnext",
              outDir: "//"
            },
            configFileDirectory: tmpDir
          };
        },
        async() {
          return err => err ? reject(err) : resolve();
        },
        emitError: reject
      }, Buffer.from(fs.readFileSync(resourcePath)));
    });

    expect(finishModules).toHaveLength(1);
    finishModules[0]();
    expect(emitted.get("source.d.ts")).toContain(
      "export declare function value(input: string): string;"
    );
  });

  it("shares one TypeScript type-check program across source directories", async () => {
    const finishModules = [];
    const programs = [];
    const compilation = {
      errors: [],
      hooks: {
        finishModules: {
          tap(_name, handler) {
            finishModules.push(handler);
          }
        }
      }
    };
    const typescript = {
      sys: { newLine: "\n" },
      convertCompilerOptionsFromJson(options, basePath) {
        return {
          options: {
            ...options,
            baseUrl: path.resolve(basePath, options.baseUrl)
          },
          errors: []
        };
      },
      transpileModule() {
        return { outputText: "", diagnostics: [] };
      },
      createCompilerHost() {
        return {};
      },
      createProgram(files, options) {
        programs.push({ files, options });
        return {
          getSourceFile(fileName) {
            return { fileName };
          },
          emit(sourceFile, writeFile) {
            writeFile(
              sourceFile.fileName.replace(/\.tsx?$/, ".js.map"),
              JSON.stringify({ tag: "javascript" })
            );
            writeFile(
              sourceFile.fileName.replace(/\.tsx?$/, ".d.ts.map"),
              JSON.stringify({ tag: "declaration" })
            );
            writeFile(sourceFile.fileName.replace(/\.tsx?$/, ".js"), "");
            return { diagnostics: [] };
          }
        };
      },
      getPreEmitDiagnostics() {
        return [];
      }
    };
    const load = resourcePath => new Promise((resolve, reject) => {
      tsLoader.call({
        _compilation: compilation,
        resourcePath,
        sourceMap: false,
        cacheable() {},
        getOptions() {
          return {
            compiler: typescript,
            compilerOptions: { baseUrl: "." },
            configFileDirectory: tmpDir
          };
        },
        async() {
          return (err, _output, map) => err ? reject(err) : resolve(map);
        },
        emitError: reject
      }, Buffer.from("export default 1;"));
    });

    const firstMap = await load(path.join(tmpDir, "src", "a.ts"));
    const secondMap = await load(path.join(tmpDir, "src", "nested", "b.ts"));

    expect(finishModules).toHaveLength(1);
    finishModules[0]();
    expect(programs).toHaveLength(1);
    expect(programs[0].files).toEqual([path.join(tmpDir, "src", "a.ts")]);
    expect(firstMap.tag).toBe("javascript");
    expect(secondMap.tag).toBe("javascript");
  });
});
