const { resolve } = require("path");
const args = require("arg")({
  "--help": Boolean,
  "-h": "--help",
  "--external": [String],
  "-e": "--external",
  "--out": String,
  "-o": "--out",
  "--no-minify": Boolean,
  M: "--no-minify"
});

const usage = `ncc build <input-file> [opts]
Options:
  -M, --no-minify       Skip output minification
  -e, --external [mod]  Skip bundling 'mod'. Can be used many times
  -o, --out [file]      Output directory (defaults to dist)
  -h, --help            Show help
`;

if (args["--help"]) {
  console.error(usage);
  process.exit(2);
}

if (args._.length === 0) {
  console.error(`Error: No command specified\n${usage}`);
  process.exit(1);
}

switch (args._[0]) {
  case "build":
    if (args._.length > 2) {
      console.error(`Error: Too many build arguments provided\n${usage}`);
      process.exit(1);
    }

    const ncc = require("./index.js")(require.resolve(resolve(args._[1] || ".")), {
      minify: !args["--no-minify"],
      externals: args["--external"]
    });
    
    ncc.then(({ code, assets }) => {
      const outDir = args["--out"] || resolve("dist");
      const fs = require("fs");
      const mkdirp = require("mkdirp");
      mkdirp.sync(outDir);
      fs.writeFileSync(outDir + "/index.js", code);
      Object.keys(assets).forEach(asset => {
        mkdirp.sync(path.dirname(asset));
        fs.writeFileSync(outDir + "/" + asset, assets[asset]);
      });
    });
  break;

  default:
    console.error(`Error: Invalid command "${args._[0]}"\n${usage}`);
    process.exit(1);
}