const { resolve, relative, dirname, sep } = require("path");
const glob = require("glob");
const shebangRegEx = require("./utils/shebang");

const usage = `Usage: ncc <cmd> <opts>

Commands:
  build <input-file> [opts]
  run <input-file> [opts]
  help
  version

Options:
  -o, --out [file]      Output directory for build (defaults to dist)
  -M, --no-minify       Skip output minification
  -S, --no-source-map   Skip source map output
  -e, --external [mod]  Skip bundling 'mod'. Can be used many times
  -q, --quiet           Disable build summaries / non-error outputs
`;

let args;
try {
  args = require("arg")({
    "--external": [String],
    "-e": "--external",
    "--out": String,
    "-o": "--out",
    "--no-minify": Boolean,
    "-M": "--no-minify",
    "--no-source-map": Boolean,
    "-S": "--no-source-map",
    "--quiet": Boolean,
    "-q": "--quiet"
  });
} catch (e) {
  if (e.message.indexOf("Unknown or unexpected option") === -1) throw e;
  console.error(e.message + `\n${usage}`);
  process.exit(1);
}

function renderSummary(code, assets, outDir, buildTime) {
  if (outDir && !outDir.endsWith(sep)) outDir += sep;
  const codeSize = Math.round(Buffer.byteLength(code, "utf8") / 1024);
  const assetSizes = Object.create(null);
  let maxSize = codeSize;
  let maxAssetNameLength = 8; // "index.js".length
  for (const asset of Object.keys(assets)) {
    const assetSource = assets[asset];
    const assetSize = Math.round(
      (assetSource.byteLength || Buffer.byteLength(assetSource, "utf8")) / 1024
    );
    assetSizes[asset] = assetSize;
    if (assetSize > maxSize) maxSize = assetSize;
    if (asset.length > maxAssetNameLength) maxAssetNameLength = asset.length;
  }
  const orderedAssets = Object.keys(assets).sort((a, b) =>
    assetSizes[a] > assetSizes[b] ? 1 : -1
  );

  const sizePadding = maxSize.toString().length;

  const indexRender = `${codeSize
    .toString()
    .padStart(sizePadding, " ")}kB  ${outDir}${"index.js".padEnd(
    maxAssetNameLength,
    " "
  )}   [${buildTime}ms]`;

  let output = "",
    first = true;
  for (const asset of orderedAssets) {
    if (first) first = false;
    else output += "\n";
    if (codeSize < assetSizes[asset]) output += indexRender + "\n";
    output += `${assetSizes[asset]
      .toString()
      .padStart(sizePadding, " ")}kB  ${outDir}${asset}`;
  }

  if (maxSize === codeSize) output += (first ? "" : "\n") + indexRender;

  return output;
}

if (args._.length === 0) {
  console.error(`Error: No command specified\n${usage}`);
  process.exit(1);
}

let run = false;
let outDir = args["--out"];

switch (args._[0]) {
  case "run":
    if (args._.length > 2) {
      console.error(`Error: Too many run arguments provided\n${usage}`);
      process.exit(1);
    }
    if (args["--out"]) {
      console.error(
        `Error: --out flag is not compatible with ncc run\n${usage}`
      );
      process.exit(1);
    }
    outDir = resolve(
      require("os").tmpdir(),
      Math.random()
        .toString(16)
        .substr(2)
    );
    run = true;

  // fallthrough
  case "build":
    if (args._.length > 2) {
      console.error(`Error: Too many build arguments provided\n${usage}`);
      process.exit(1);
    }

    const startTime = Date.now();
    const ncc = require("./index.js")(
      eval("require.resolve")(resolve(args._[1] || ".")),
      {
        minify: !args["--no-minify"] && !run,
        externals: args["--external"],
        sourceMap: !args["--no-source-map"]
      }
    );
    ncc.then(
      async ({ code, map, assets }) => {
        outDir = outDir || resolve("dist");
        const fs = require("fs");
        const mkdirp = require("mkdirp");
        mkdirp.sync(outDir);
        // remove all existing ".js" files in the out directory
        await Promise.all(
          (await new Promise((resolve, reject) =>
            glob(outDir + '/**/*.js', (err, files) => err ? reject(err) : resolve(files))
          )).map(file =>
            new Promise((resolve, reject) => fs.unlink(file, err => err ? reject(err) : resolve())
          ))
        );
        fs.writeFileSync(outDir + "/index.js", code, { mode: code.match(shebangRegEx) ? 0o777 : 0o666 });
        if (map) fs.writeFileSync(outDir + "/index.js.map", map);

        for (const asset of Object.keys(assets)) {
          mkdirp.sync(dirname(asset));
          fs.writeFileSync(outDir + "/" + asset, assets[asset]);
        }

        if (!args["--quiet"])
          console.log(
            renderSummary(
              code,
              assets,
              run ? "" : relative(process.cwd(), outDir),
              Date.now() - startTime
            )
          );

        if (run) {
          const ps = require("child_process").fork(outDir + "/index.js", {
            execArgv: map
              ? ["-r", resolve(__dirname, "sourcemap-register")]
              : []
          });
          ps.on("close", () => require("rimraf").sync(outDir));
        }
      },
      err => {
        console.error(err.stack);
        process.exit(1);
      }
    );
    break;

  case "help":
    console.error(usage);
    process.exit(2);

  case "version":
    console.log(require("../package.json").version);
    break;

  default:
    console.error(`Error: Invalid command "${args._[0]}"\n${usage}`);
    process.exit(1);
}
