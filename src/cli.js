#!/usr/bin/env node

const { resolve, relative, dirname, sep } = require("path");
const glob = require("glob");
const rimraf = require("rimraf");
const crypto = require("crypto");
const { writeFileSync, unlink, existsSync, symlinkSync } = require("fs");
const mkdirp = require("mkdirp");
const { version: nccVersion } = require('../package.json');

const usage = `Usage: ncc <cmd> <opts>

Commands:
  build <input-file>+ [opts]
  run <input-file> <args>? [opts]
  cache clean|dir|size
  help
  version

Options:
  -o, --out [file]         Output directory for build (defaults to dist)
  -m, --minify             Minify output
  -C, --no-cache           Skip build cache population
  -s, --source-map         Generate source map
  --no-source-map-register Skip source-map-register source map support
  -e, --external [mod]     Skip bundling 'mod'. Can be used many times
  -q, --quiet              Disable build summaries / non-error outputs
  -w, --watch              Start a watched build
  --v8-cache               Emit a build using the v8 compile cache
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

function renderSummary(files, outDir, buildTime) {
  if (outDir && !outDir.endsWith(sep)) outDir += sep;
  const fileSizes = Object.create(null);
  let totalSize = 0;
  let maxAssetNameLength = 0;
  for (const file of Object.keys(files)) {
    const assetSource = files[file].source;
    if (!assetSource) continue;
    const assetSize = Math.round(
      (assetSource.byteLength || Buffer.byteLength(assetSource, "utf8")) / 1024
    );
    fileSizes[file] = assetSize;
    totalSize += assetSize;
    if (file.length > maxAssetNameLength) maxAssetNameLength = file.length;
  }
  const orderedAssets = Object.keys(files).filter(file => typeof files[file] === 'object').sort((a, b) => {
    if ((a.startsWith('asset/') || b.startsWith('asset/')) &&
        !(a.startsWith('asset/') && b.startsWith('asset/')))
      return a.startsWith('asset/') ? 1 : -1;
    return fileSizes[a] > fileSizes[b] ? 1 : -1;
  });

  const sizePadding = totalSize.toString().length;

  let output = "",
    first = true;
  for (const file of orderedAssets) {
    if (first) first = false;
    else output += "\n";
    output += `${fileSizes[file]
      .toString()
      .padStart(sizePadding, " ")}kB  ${outDir}${file}`;
  }

  output += `\n${totalSize}kB  [${buildTime}ms] - ncc ${nccVersion}`;

  return output;
}

function nccError(msg, exitCode = 1) {
  const err = new Error(msg);
  err.nccError = true;
  err.exitCode = exitCode;
  throw err;
}

async function runCmd (argv, stdout, stderr) {
  let args;
  try {
    args = require("arg")({
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
      "--no-source-map-register": Boolean,
      "--quiet": Boolean,
      "-q": "--quiet",
      "--watch": Boolean,
      "-w": "--watch",
      "--v8-cache": Boolean
    }, {
      permissive: false,
      argv
    });
  } catch (e) {
    if (e.message.indexOf("Unknown or unexpected option") === -1) throw e;
    nccError(e.message + `\n${usage}`, 2);
  }

  if (args._.length === 0)
    nccError(`Error: No command specified\n${usage}`, 2);

  let run = false;
  let outDir = args["--out"];
  const quiet = args["--quiet"];

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
      var runArgs = args._.slice(2);

      if (args["--out"])
        errFlagNotCompatible("--out", "run");

      if (args["--watch"])
        errFlagNotCompatible("--watch", "run");

      outDir = resolve(
        require("os").tmpdir(),
        crypto.createHash('md5').update(resolve(args._[1] || ".")).digest('hex')
      );
      if (existsSync(outDir))
        rimraf.sync(outDir);
      run = true;

    // fallthrough
    case "build":
      const buildFiles = (runArgs || args._.length === 2) ? resolve(args._[1]) : args._.slice(1);

      let startTime = Date.now();
      let ps;
      const ncc = require("./index.js")(
        buildFiles,
        {
          debugLog: args["--debug"],
          minify: args["--minify"],
          externals: args["--external"],
          sourceMap: args["--source-map"] || run,
          sourceMapRegister: args["--no-source-map-register"] ? false : undefined,
          cache: args["--no-cache"] ? false : undefined,
          watch: args["--watch"],
          v8cache: args["--v8-cache"],
          quiet
        }
      );

      async function handler ({ err, files, symlinks }) {
        // handle watch errors
        if (err) {
          stderr.write(err + '\n');
          stdout.write('Watching for changes...\n');
          return;
        }

        outDir = outDir || resolve("dist");
        mkdirp.sync(outDir);
        // remove all existing ".js" files in the out directory
        await Promise.all(
          (await new Promise((resolve, reject) =>
            glob(outDir + '/**/*.js', (err, files) => err ? reject(err) : resolve(files))
          )).map(file =>
            new Promise((resolve, reject) => unlink(file, err => err ? reject(err) : resolve())
          ))
        );

        for (const filename of Object.keys(files)) {
          const file = files[filename];
          const filePath = outDir + "/" + filename;
          mkdirp.sync(dirname(filePath));
          writeFileSync(filePath, file.source, { mode: file.permissions });
        }

        for (const filename of Object.keys(symlinks)) {
          const file = symlinks[filename];
          const filePath = outDir + "/" + filename;
          mkdirp.sync(dirname(filePath));
          symlinkSync(file, filePath);
        }

        if (!quiet) {
          stdout.write(
            renderSummary(
              files,
              run ? "" : relative(process.cwd(), outDir),
              Date.now() - startTime,
            ) + '\n'
          );

          if (args["--watch"])
            stdout.write('Watching for changes...\n');
        }

        if (run) {
          // find node_modules
          const root = resolve('/node_modules');
          const buildFile = resolve(args._[1]);
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
          ps = require("child_process").fork(outDir + "/index.js", runArgs, {
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
      nccError(usage, 2);

    case "version":
      stdout.write(require("../package.json").version + '\n');
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
