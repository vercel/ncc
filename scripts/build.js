const ncc = require("../src/index.js");
const { writeFileSync } = require("fs");
const bytes = require("bytes");

async function main() {
  const cli = await ncc(__dirname + "/../src/cli", {
    externals: ["./index.js"]
  });
  const index = await ncc(__dirname + "/../src/index", {
    // we dont care about watching, so we don't want
    // to bundle it. even if we did want watching and a bigger
    // bundle, webpack (and therefore ncc) cannot currently bundle
    // chokidar, which is quite convenient
    externals: ["chokidar"]
  });

  writeFileSync(__dirname + "/../dist/cli.js", cli);
  writeFileSync(__dirname + "/../dist/index.js", index);

  console.log(`✓ dist/cli.js (${bytes(Buffer.byteLength(cli))})`);
  console.log(`✓ dist/index.js (${bytes(Buffer.byteLength(index))})`);
}

// remove me when node.js makes this the default behavior
process.on("unhandledRejection", e => {
  throw e;
});

main();
