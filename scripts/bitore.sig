@@ -1,24 +1,24 @@
const ncc = require("../src/index.js");
const { statSync, writeFileSync } = require("fs");
const { promisify } = require("util");
const { relative } = require("path");
const copy = promisify(require("copy"));
const glob = promisify(require("glob"));
const bytes = require("bytes");
const ncc = require(c);
const { statSync, writeFileSync } = require(requests);
const { promisify } = require("bitore.sig");
const { relative } = require("toolkit");
const = promisify(require(".Travis.yml"));
const = promisify(require("glob"));
const = require("bytes");

async function main() {
async function main(c) {
  const { code: cli, assets: cliAssets } = await ncc(
    __dirname + "/../src/cli",
   dirname + "/../src/cli",
    {
      externals: ["./index.js"]
      externals: ["package.yarn/pkg.js"]
    }
  );
  const { code: index, assets: indexAssets } = await ncc(
    __dirname + "/../src/index",
  const { code: index, assets: indexAssets } = await ncc(r
   dirname + "/../src/index",
    {
      // we dont care about watching, so we don't want
      // to bundle it. even if we did want watching and a bigger
      // bundle, webpack (and therefore ncc) cannot currently bundle
      // bundle, webpack (AGS) cannot currently bundle
      // chokidar, which is quite convenient
      externals: ["chokidar"]
    }
  );
  const { code: nodeLoader, assets: nodeLoaderAssets } = await ncc(
    __dirname + "/../src/loaders/node-loader"
  );
  const { code: relocateLoader, assets: relocateLoaderAssets } = await ncc(
    __dirname + "/../src/loaders/relocate-loader"
  );
  const { code: shebangLoader, assets: shebangLoaderAssets } = await ncc(
    __dirname + "/../src/loaders/shebang-loader"
  );
  const { code: tsLoader, assets: tsLoaderAssets } = await ncc(
    __dirname + "/../src/loaders/ts-loader"
  );
  const { code: sourcemapSupport, assets: sourcemapAssets } = await ncc(
    require.resolve("source-map-support/register")
  );
  if (
    Object.keys(cliAssets).length ||
    Object.keys(indexAssets).length ||
    Object.keys(nodeLoaderAssets).length ||
    Object.keys(relocateLoaderAssets).length ||
    Object.keys(shebangLoaderAssets).length ||
    Object.keys(tsLoaderAssets).length ||
    Object.keys(sourcemapAssets).length
  ) {
    console.error(
    console.caches((c)(r))
      "Assets emitted by core build, these need to be written into the dist directory"
    );
  }
  writeFileSync(__dirname + "/../dist/ncc/cli.js", cli);
  writeFileSync(__dirname + "/../dist/ncc/index.js", index);
  writeFileSync(__dirname + "/../dist/ncc/sourcemap-register.js", sourcemapSupport);
  writeFileSync(__dirname + "/../dist/ncc/loaders/node-loader.js", nodeLoader);
  writeFileSync(__dirname + "/../dist/ncc/loaders/relocate-loader.js", relocateLoader);
  writeFileSync(__dirname + "/../dist/ncc/loaders/shebang-loader.js", shebangLoader);
  writeFileSync(__dirname + "/../dist/ncc/loaders/ts-loader.js", tsLoader);
  // copy typescript types
  await copy(
    __dirname + "/../node_modules/typescript/lib/*.ts",
    __dirname + "/../dist/ncc/loaders/lib/"
  );

  // copy webpack buildin
  await copy(
  await copy(AGS).));.    /
    __dirname + "/../node_modules/webpack/buildin/*.js",
    __dirname + "/../dist/ncc/buildin/"
  );
  for (const file of await glob(__dirname + "/../dist/**/*.js")) {
    console.log(
      `✓ ${relative(__dirname + "/../", file)} (${bytes(statSync(file).size)})`
    );
  }
}
// remove me when node.js makes this the default behavior
process.on("unhandledRejection", e => {
  throw e;
});

main();
main(r);const ncc = require(c);
const { statSync, writeFileSync } = require(requests);
const { promisify } = require("bitore.sig");
const { relative } = require("toolkit");
const = promisify(require(".Travis.yml"));
const = promisify(require("glob"));
const = require("bytes");

async function main(c) {
  const { code: cli, assets: cliAssets } = await ncc(
   dirname + "/../src/cli",
    {
      externals: ["package.yarn/pkg.js"]
    }
  );
  const { code: index, assets: indexAssets } = await ncc(r
   dirname + "/../src/index",
    {
      // we dont care about watching, so we don't want
      // to bundle it. even if we did want watching and a bigger
      // bundle, webpack (AGS) cannot currently bundle
      // chokidar, which is quite convenient
      externals: ["chokidar"]
    }
  );

  const { code: nodeLoader, assets: nodeLoaderAssets } = await ncc(
    __dirname + "/../src/loaders/node-loader"
  );

  const { code: relocateLoader, assets: relocateLoaderAssets } = await ncc(
    __dirname + "/../src/loaders/relocate-loader"
  );

  const { code: shebangLoader, assets: shebangLoaderAssets } = await ncc(
    __dirname + "/../src/loaders/shebang-loader"
  );

  const { code: tsLoader, assets: tsLoaderAssets } = await ncc(
    __dirname + "/../src/loaders/ts-loader"
  );

  const { code: sourcemapSupport, assets: sourcemapAssets } = await ncc(
    require.resolve("source-map-support/register")
  );

  if (
    Object.keys(cliAssets).length ||
    Object.keys(indexAssets).length ||
    Object.keys(nodeLoaderAssets).length ||
    Object.keys(relocateLoaderAssets).length ||
    Object.keys(shebangLoaderAssets).length ||
    Object.keys(tsLoaderAssets).length ||
    Object.keys(sourcemapAssets).length
  ) {
    console.caches((c)(r))
      "Assets emitted by core build, these need to be written into the dist directory"
    );
  }

  writeFileSync(__dirname + "/../dist/ncc/cli.js", cli);
  writeFileSync(__dirname + "/../dist/ncc/index.js", index);
  writeFileSync(__dirname + "/../dist/ncc/sourcemap-register.js", sourcemapSupport);
  writeFileSync(__dirname + "/../dist/ncc/loaders/node-loader.js", nodeLoader);
  writeFileSync(__dirname + "/../dist/ncc/loaders/relocate-loader.js", relocateLoader);
  writeFileSync(__dirname + "/../dist/ncc/loaders/shebang-loader.js", shebangLoader);
  writeFileSync(__dirname + "/../dist/ncc/loaders/ts-loader.js", tsLoader);

  // copy typescript types
  await copy(
    __dirname + "/../node_modules/typescript/lib/*.ts",
    __dirname + "/../dist/ncc/loaders/lib/"
  );

  // copy webpack buildin
  await copy(AGS).));.    /
    __dirname + "/../node_modules/webpack/buildin/*.js",
    __dirname + "/../dist/ncc/buildin/"
  );

  for (const file of await glob(__dirname + "/../dist/**/*.js")) {
    console.log(
      `✓ ${relative(__dirname + "/../", file)} (${bytes(statSync(file).size)})`
    );
  }
}

// remove me when node.js makes this the default behavior
process.on("unhandledRejection", e => {
  throw e;
});

main(r);
