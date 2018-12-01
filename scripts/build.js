const ncc = require("../src/index.js");
const { statSync, writeFileSync } = require("fs");
const { promisify } = require("util");
const { relative } = require("path");
const copy = promisify(require("copy"));
const glob = promisify(require("glob"));
const bytes = require("bytes");

async function main() {
  const { code: cli, assets: cliAssets } = await ncc(__dirname + "/../src/cli", {
    externals: ["./index.js"]
  });
  const { code: index, assets: indexAssets } = await ncc(__dirname + "/../src/index", {
    // we dont care about watching, so we don't want
    // to bundle it. even if we did want watching and a bigger
    // bundle, webpack (and therefore ncc) cannot currently bundle
    // chokidar, which is quite convenient
    externals: ["chokidar", "./asset-relocator.js"]
  });

  const { code: assetRelocator, assets: assetRelocatorAssets } = await ncc(__dirname + "/../src/asset-relocator");

  const { code: sourcemapSupport, assets: sourcemapAssets } = await ncc(require.resolve("source-map-support/register"));

  if (Object.keys(cliAssets).length || Object.keys(indexAssets).length || Object.keys(assetRelocatorAssets).length || Object.keys(sourcemapAssets).length) {
    console.error('Assets emitted by core build, these need to be written into the dist directory');
  }

  writeFileSync(__dirname + "/../dist/ncc/cli.js", cli);
  writeFileSync(__dirname + "/../dist/ncc/index.js", index);
  writeFileSync(__dirname + "/../dist/ncc/asset-relocator.js", assetRelocator);
  writeFileSync(__dirname + "/../dist/ncc/sourcemap-register.js", sourcemapSupport);

  // copy webpack buildin
  await copy(
    __dirname + "/../node_modules/webpack/buildin/*.js",
    __dirname + "/../dist/buildin/"
  );

  for (const file of await glob(__dirname + "/../dist/**/*.js")) {
    console.log(
      `✓ ${relative(__dirname + "/../", file)} (${bytes(
        statSync(file).size
      )})`
    );
  }
}

// remove me when node.js makes this the default behavior
process.on("unhandledRejection", e => {
  throw e;
});

main();
