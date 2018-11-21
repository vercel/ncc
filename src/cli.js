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

if (args["--help"]) {
  console.error(`ncc <input-file> [opts]
  Options:
    -M, --no-minify       Skip output minification
    -e, --external [mod]  Skip bundling 'mod'. Can be used many times
    -o, --out [file]      Output file (defaults to stdout)
    -h, --help            Show help
`);
  process.exit(2);
}

if (args._.length !== 1) {
  console.error(`Error: invalid arguments number (${args._.length})`);
  console.error("Usage: ncc <input-file> [opts]");
  process.exit(1);
}

const ncc = require("./index.js")(resolve(args._[0]), {
  minify: !args["--no-minify"],
  externals: args["--external"]
});

ncc.then(code => {
  if (args["--out"]) {
    require("fs").writeFileSync(args["--out"], code);
  } else {
    process.stdout.write(code);
  }
});
