#!/usr/bin/env node
const args = require("arg")({
  "--help": Boolean,
  "-h": "--help",
  "--out": String,
  "-o": "--out",
  "--no-minify": Boolean,
  M: "--no-minify"
});

if (args["--help"]) {
  console.error(`ncc <input-file> [opts]
  Options:
    -M, --no-minify       Skip output minification
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

const ncc = require("./")(args._[0], {
  minify: !args["--no-minify"]
});

ncc.then(({ code }) => {
  if (args["--out"]) {
    require("fs").writeFileSync(args["--out"], code);
  } else {
    process.stdout.write(code);
  }
});
