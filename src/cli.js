#!/usr/bin/env node

const { resolve, relative, dirname, sep } = require("path");
const glob = require("glob");
const shebangRegEx = require("./utils/shebang");
const rimraf = require("rimraf");
const crypto = require("crypto");
const { writeFileSync, unlink, existsSync, symlinkSync } = require("fs");
const { hasTypeModule } = require('./utils/has-type-module');
const mkdirp = require("mkdirp");
const { version: nccVersion } = require('../package.json');

// License and TypeScript plugins have Webpack deprecation warnings
// we don't want these on when running as a CLI utility
process.noDeprecation = true;

const usage = `Usage: ncc <cmd> <opts>

Commands:
  build <input-file> [opts]
  run <input-file> [opts]
  cache clean|dir|size
  help
  version

Options:
  -o, --out [file]         Output directory for build (defaults to dist)
  -m, --minify             Minify output
  -C, --no-cache           Skip build cache population
  -s, --source-map         Generate source map
  -a, --asset-builds       Build nested JS assets recursively, useful for
                           when code is loaded as an asset eg for workers.
  --no-source-map-register Skip source-map-register source map support
  -e, --external [mod]     Skip bundling 'mod'. Can be used many times
  -q, --quiet              Disable build summaries / non-error outputs
  -w, --watch              Start a watched build
  -t, --transpile-only     Use transpileOnly option with the ts-loader
  --v8-cache               Emit a build using the v8 compile cache
  --license [file]         Adds a file containing licensing information to the output
  --stats-out [file]       Emit webpack stats as json to the specified output file
  --target [es]            ECMAScript target to use for output (default: es2015)
                           Learn more: https://webpack.js.org/configuration/target
  -d, --debug              Show debug logs
`;

// support an API mode for CLI testing
let api = false;
if (require.main === module) {
  runCmd(process.argv.slice(2), process.stdout, process.stderr)
  .then((watching) => {
    if (!watching)
      process.exit();
  })
  .catch(e => {
    if (!e.silent)
      console.error(e.nccError ? e.message : e);
    process.exit(e.exitCode || 1);
  });
}
else {
  module.exports = runCmd;
  api = true;
}

function renderSummary(code, map, assets, ext, outDir, buildTime) {
  if (outDir && !outDir.endsWith(sep)) outDir += sep;
  const codeSize = Math.round(Buffer.byteLength(code, "utf8") / 1024);
  const mapSize = map ? Math.round(Buffer.byteLength(map, "utf8") / 1024) : 0;
  const assetSizes = Object.create(null);
  let totalSize = codeSize;
  let maxAssetNameLength = 8 + (map ? 4 : 0); // length of index.js(.map)?
  for (const asset of Object.keys(assets)) {
    const assetSource = assets[asset].source;
    const assetSize = Math.round(
      (assetSource.byteLength || Buffer.byteLength(assetSource, "utf8")) / 1024
    );
    assetSizes[asset] = assetSize;
    totalSize += assetSize;
    if (asset.length > maxAssetNameLength) maxAssetNameLength = asset.length;
  }
  const orderedAssets = Object.keys(assets).sort((a, b) =>
    assetSizes[a] > assetSizes[b] ? 1 : -1
  );

  const sizePadding = totalSize.toString().length;

  let indexRender = `${codeSize
    .toString()
    .padStart(sizePadding, " ")}kB  ${outDir}index${ext}`;
  let indexMapRender = map ? `${mapSize
    .toString()
    .padStart(sizePadding, " ")}kB  ${outDir}index${ext}.map` : '';

  let output = "",
    first = true;
  for (const asset of orderedAssets) {
    if (first) first = false;
    else output += "\n";
    if (codeSize < assetSizes[asset] && indexRender) {
      output += indexRender + "\n";
      indexRender = null;
    }
    if (mapSize && mapSize < assetSizes[asset] && indexMapRender) {
      output += indexMapRender + "\n";
      indexMapRender = null;
    }
    output += `${assetSizes[asset]
      .toString()
      .padStart(sizePadding, " ")}kB  ${outDir}${asset}`;
  }

  if (indexRender) {
    output += (first ? "" : "\n") + indexRender;
    first = false;
  }
  if (indexMapRender) output += (first ? "" : "\n") + indexMapRender;

  output += `\n${totalSize}kB  [${buildTime}ms] - ncc ${nccVersion}`;

  return output;
}

function nccError(msg, exitCode = 1) {
  const err = new Error(msg);
  err.nccError = true;
  err.exitCode = exitCode;
  throw err;
}

function showHelp() {
  nccError(usage, 2)
}

function showVersion() {
  process.stdout.write(require("../package.json").version + '\n');
}

async function runCmd (argv, stdout, stderr) {
  let args;
  try {
    args = require("arg")({
      "--help": Boolean,
      "-h": "--help",
      "--version": Boolean,
      "-v": "--version",
      "--asset-builds": Boolean,
      '-a': '--asset-builds',
      "--debug": Boolean,
      "-d": "--debug",
      "--external": [String],
      "-e": "--external",
      "--out": String,
      "-o": "--out",
      "--minify": Boolean,
      "-m": "--minify",
      "--source-map": Boolean,
      "-s": "--source-map",
      "--no-cache": Boolean,
      "-C": "--no-cache",
      "--no-asset-builds": Boolean,
      "--no-source-map-register": Boolean,
      "--quiet": Boolean,
      "-q": "--quiet",
      "--watch": Boolean,
      "-w": "--watch",
      "--v8-cache": Boolean,
      "--transpile-only": Boolean,
      "-t": "--transpile-only",
      "--license": String,
      "--stats-out": String,
      "--target": String
    }, {
      permissive: false,
      argv
    });
  } catch (e) {
    if (e.message.indexOf("Unknown or unexpected option") === -1) throw e;
    nccError(e.message + `\n${usage}`, 2);
  }

  if (args['--help']) {
    return showHelp();
  } else if (args['--version']) {
    return showVersion();
  }

  if (args._.length === 0)
    nccError(`Error: No command specified\n${usage}`, 2);

  let run = false;
  let outDir = args["--out"];
  const quiet = args["--quiet"];
  const statsOutFile = args["--stats-out"];


  switch (args._[0]) {
    case "cache":
      if (args._.length > 2)
        errTooManyArguments("cache");

      const flags = Object.keys(args).filter(arg => arg.startsWith("--"));
      if (flags.length)
        errFlagNotCompatible(flags[0], "cache");

      const cacheDir = require("./utils/ncc-cache-dir");
      switch (args._[1]) {
        case "clean":
          rimraf.sync(cacheDir);
        break;
        case "dir":
          stdout.write(cacheDir + '\n');
        break;
        case "size":
          require("get-folder-size")(cacheDir, (err, size) => {
            if (err) {
              if (err.code === 'ENOENT') {
                stdout.write("0MB\n");
                return;
              }
              throw err;
            }
            stdout.write(`${(size / 1024 / 1024).toFixed(2)}MB\n`);
          });
        break;
        default:
          errInvalidCommand("cache " + args._[1]);
      }

    break;
    case "run":
      if (args._.length > 2)
        errTooManyArguments("run");

      if (args["--out"])
        errFlagNotCompatible("--out", "run");

      if (args["--watch"])
        errFlagNotCompatible("--watch", "run");

      outDir = resolve(
        require("os").tmpdir(),
        crypto.createHash('sha256').update(resolve(args._[1] || ".")).digest('hex')
      );
      if (existsSync(outDir))
        rimraf.sync(outDir);
      mkdirp.sync(outDir);
      run = true;

    // fallthrough
    case "build":
      if (args._.length > 2)
        errTooManyArguments("build");

      let startTime = Date.now();
      let ps;
      const buildFile = eval("require.resolve")(resolve(args._[1] || "."));
      const esm = buildFile.endsWith('.mjs') || !buildFile.endsWith('.cjs') && hasTypeModule(buildFile);
      const ext = buildFile.endsWith('.cjs') ? '.cjs' : esm && (buildFile.endsWith('.mjs') || !hasTypeModule(buildFile)) ? '.mjs' : '.js';
      const ncc = require("./index.js")(
        buildFile,
        {
          debugLog: args["--debug"],
          minify: args["--minify"],
          externals: args["--external"],
          sourceMap: args["--source-map"] || run,
          sourceMapRegister: args["--no-source-map-register"] ? false : undefined,
          assetBuilds: args["--asset-builds"] ? true : false,
          cache: args["--no-cache"] ? false : undefined,
          watch: args["--watch"],
          v8cache: args["--v8-cache"],
          transpileOnly: args["--transpile-only"],
          license: args["--license"],
          quiet,
          target: args["--target"]
        }
      );

      async function handler ({ err, code, map, assets, symlinks, stats }) {
        // handle watch errors
        if (err) {
          stderr.write(err + '\n');
          stdout.write('Watching for changes...\n');
          return;
        }

        outDir = outDir || resolve(eval("'dist'"));
        mkdirp.sync(outDir);
        // remove all existing ".js" and ".cjs" files in the out directory
        await Promise.all(
          (await new Promise((resolve, reject) =>
            glob(outDir + '/**/*.(js|cjs)', (err, files) => err ? reject(err) : resolve(files))
          )).map(file =>
            new Promise((resolve, reject) => unlink(file, err => err ? reject(err) : resolve())
          ))
        );
        writeFileSync(`${outDir}/index${ext}`, code, { mode: code.match(shebangRegEx) ? 0o777 : 0o666 });
        if (map) writeFileSync(`${outDir}/index${ext}.map`, map);

        for (const asset of Object.keys(assets)) {
          const assetPath = outDir + "/" + asset;
          mkdirp.sync(dirname(assetPath));
          writeFileSync(assetPath, assets[asset].source, { mode: assets[asset].permissions });
        }

        for (const symlink of Object.keys(symlinks)) {
          const symlinkPath = outDir + "/" + symlink;
          symlinkSync(symlinks[symlink], symlinkPath);
        }

        if (!quiet) {
          stdout.write(
            renderSummary(
              code,
              map,
              assets,
              ext,
              run ? "" : relative(process.cwd(), outDir),
              Date.now() - startTime,
            ) + '\n'
          );

          if (args["--watch"])
            stdout.write('Watching for changes...\n');
        }

        if (statsOutFile)
          writeFileSync(statsOutFile, JSON.stringify(stats.toJson()));

        if (run) {
          // find node_modules
          const root = resolve('/node_modules');
          let nodeModulesDir = dirname(buildFile) + "/node_modules";
          do {
            if (nodeModulesDir === root) {
              nodeModulesDir = undefined;
              break;
            }
            if (existsSync(nodeModulesDir))
              break;
          } while (nodeModulesDir = resolve(nodeModulesDir, "../../node_modules"));
          if (nodeModulesDir)
            symlinkSync(nodeModulesDir, outDir + "/node_modules", "junction");
          ps = require("child_process").fork(`${outDir}/index${ext}`, {
            stdio: api ? 'pipe' : 'inherit'
          });
          if (api) {
            ps.stdout.pipe(stdout);
            ps.stderr.pipe(stderr);
          }
          return new Promise((resolve, reject) => {
            function exit (code) {
              require("rimraf").sync(outDir);
              if (code === 0)
                resolve();
              else
                reject({ silent: true, exitCode: code });
              process.off("SIGTERM", exit);
              process.off("SIGINT", exit);
            }
            ps.on("exit", exit);
            process.on("SIGTERM", exit);
            process.on("SIGINT", exit);
          });
        }
      }
      if (args["--watch"]) {
        ncc.handler(handler);
        ncc.rebuild(() => {
          if (ps)
            ps.kill();
          startTime = Date.now();
          stdout.write('File change, rebuilding...\n');
        });
        return true;
      } else {
        return ncc.then(handler);
      }
      break;

    case "help":
      showHelp();
      break;

    case "version":
      showVersion();
      break;

    default:
      errInvalidCommand(args._[0], 2);
  }

  function errTooManyArguments (cmd) {
    nccError(`Error: Too many ${cmd} arguments provided\n${usage}`, 2);
  }

  function errFlagNotCompatible (flag, cmd) {
    nccError(`Error: ${flag} flag is not compatible with ncc ${cmd}\n${usage}`, 2);
  }

  function errInvalidCommand (cmd) {
    nccError(`Error: Invalid command "${cmd}"\n${usage}`, 2);
  }

  // remove me when node.js makes this the default behavior
  process.on("unhandledRejection", e => {
    throw e;
  });
}
