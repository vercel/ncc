const { resolve } = require("path");
const args = require("arg")({
  "--external": [String],
  "-e": "--external",
  "--out": String,
  "-o": "--out",
  "--no-minify": Boolean,
  M: "--no-minify"
});

const usage = `Usage: ncc <cmd> <opts>

Commands:
  build <input-file> [opts]
  run <input-file> [opts]
  help
  version

Options:
  -o, --out [file]      Output directory for build (defaults to dist)
  -M, --no-minify       Skip output minification
  -e, --external [mod]  Skip bundling 'mod'. Can be used many times
`;

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
      console.error(`Error: --out flag is not compatible with ncc run\n${usage}`);
      process.exit(1);
    }
    outDir = resolve(require("os").tmpdir(), Math.random().toString(16).substr(2));
    run = true;

    // fallthrough
  case "build":
    if (args._.length > 2) {
      console.error(`Error: Too many build arguments provided\n${usage}`);
      process.exit(1);
    }

    const ncc = require("./index.js")(eval("require.resolve")(resolve(args._[1] || ".")), {
      minify: !args["--no-minify"],
      externals: args["--external"]
    });
    
    ncc.then(({ code, assets }) => {
      outDir = outDir || resolve("dist");
      const fs = require("fs");
      const mkdirp = require("mkdirp");
      mkdirp.sync(outDir);
      fs.writeFileSync(outDir + "/index.js", code);
      for (const asset of Object.keys(assets)) {
        mkdirp.sync(path.dirname(asset));
        fs.writeFileSync(outDir + "/" + asset, assets[asset]);
      }

      if (run) {
        const ps = require("child_process").fork(outDir + "/index.js");
        ps.on("close", () => require("rimraf").sync(outDir));
      }
    });
  break;

  case "help":
    console.error(usage);
    process.exit(2);

  case "version":
    console.log(require('../package.json').version);
  break;

  default:
    console.error(`Error: Invalid command "${args._[0]}"\n${usage}`);
    process.exit(1);
}
