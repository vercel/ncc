const ncc = require("../src/index.js");
const { statSync, writeFileSync, readFileSync } = require("fs");
const { promisify } = require("util");
const { relative } = require("path");
const copy = promisify(require("copy"));
const glob = promisify(require("glob"));
const bytes = require("bytes");

async function main() {
  const { code: cli, assets: cliAssets } = await ncc(
    __dirname + "/../src/cli",
    {
      filename: "cli.js",
      externals: ["./index.js"],
      minify: true,
      v8cache: true
    }
  );

  const { code: index, assets: indexAssets } = await ncc(
    __dirname + "/../src/index",
    {
      // we dont care about watching, so we don't want
      // to bundle it. even if we did want watching and a bigger
      // bundle, webpack (and therefore ncc) cannot currently bundle
      // chokidar, which is quite convenient
      externals: ["chokidar"],
      filename: "index.js",
      minify: true,
      v8cache: true
    }
  );

  const { code: nodeLoader, assets: nodeLoaderAssets } = await ncc(
    __dirname + "/../src/loaders/node-loader",
    {
      filename: "node-loader.js",
      minify: true,
      v8cache: true
    }
  );

  const { code: relocateLoader, assets: relocateLoaderAssets } = await ncc(
    __dirname + "/../src/loaders/relocate-loader",
    { filename: "relocate-loader.js", minify: true, v8cache: true }
  );

  const { code: shebangLoader, assets: shebangLoaderAssets } = await ncc(
    __dirname + "/../src/loaders/shebang-loader",
    { filename: "shebang-loader.js", minify: true, v8cache: true }
  );

  const { code: tsLoader, assets: tsLoaderAssets } = await ncc(
    __dirname + "/../src/loaders/ts-loader",
    {
      externals: ["typescript"],
      filename: "ts-loader.js",
      minify: true,
      v8cache: true
    }
  );

  const { code: sourcemapSupport, assets: sourcemapAssets } = await ncc(
    require.resolve("source-map-support/register"),
    { filename: "source-register.js", minfiy: true, v8cache: true }
  );

  const { code: typescript, assets: typescriptAssets } = await ncc(
    "typescript",
    { minify: true }
  );

  // detect unexpected asset emissions from core build
  const unknownAssets = [
    ...Object.keys(cliAssets),
    ...Object.keys(indexAssets).filter(asset => !asset.startsWith('locales/')),
    ...Object.keys(nodeLoaderAssets),
    ...Object.keys(relocateLoaderAssets),
    ...Object.keys(shebangLoaderAssets),
    ...Object.keys(tsLoaderAssets).filter(asset => !asset.startsWith('lib/')),
    ...Object.keys(sourcemapAssets),
    ...Object.keys(typescriptAssets).filter(asset => !asset.startsWith('lib/'))
  ].filter(asset => !asset.endsWith('.js.cache') && !asset.endsWith('.cache.js'));
  
  if (unknownAssets.length) {
    console.error("New assets are being emitted by the core build");
    console.log(unknownAssets);
  }

  writeFileSync(__dirname + "/../dist/ncc/cli.js.cache", cliAssets["cli.js.cache"]);
  writeFileSync(__dirname + "/../dist/ncc/index.js.cache", indexAssets["index.js.cache"]);
  writeFileSync(__dirname + "/../dist/ncc/sourcemap-register.js.cache", sourcemapAssets["sourcemap-register.js.cache"]);
  writeFileSync(__dirname + "/../dist/ncc/loaders/node-loader.js.cache", nodeLoaderAssets["node-loader.js.cache"]);
  writeFileSync(__dirname + "/../dist/ncc/loaders/relocate-loader.js.cache", relocateLoaderAssets["relocate-loader.js.cache"]);
  writeFileSync(__dirname + "/../dist/ncc/loaders/shebang-loader.js.cache", shebangLoaderAssets["shebang-loader.js.cache"]);
  writeFileSync(__dirname + "/../dist/ncc/loaders/ts-loader.js.cache", tsLoaderAssets["ts-loader.js.cache"]);

  writeFileSync(__dirname + "/../dist/ncc/cli.js.cache.js", cliAssets["cli.js.cache.js"]);
  writeFileSync(__dirname + "/../dist/ncc/index.js.cache.js", indexAssets["index.js.cache.js"]);
  writeFileSync(__dirname + "/../dist/ncc/sourcemap-register.js.cache.js", sourcemapAssets["sourcemap-register.js.cache.js"]);
  writeFileSync(__dirname + "/../dist/ncc/loaders/node-loader.js.cache.js", nodeLoaderAssets["node-loader.js.cache.js"]);
  writeFileSync(__dirname + "/../dist/ncc/loaders/relocate-loader.js.cache.js", relocateLoaderAssets["relocate-loader.js.cache.js"]);
  writeFileSync(__dirname + "/../dist/ncc/loaders/shebang-loader.js.cache.js", shebangLoaderAssets["shebang-loader.js.cache.js"]);
  writeFileSync(__dirname + "/../dist/ncc/loaders/ts-loader.js.cache.js", tsLoaderAssets["ts-loader.js.cache.js"]);

  writeFileSync(__dirname + "/../dist/ncc/cli.js", cli);
  writeFileSync(__dirname + "/../dist/ncc/index.js", index);
  writeFileSync(__dirname + "/../dist/ncc/typescript/index.js", `
try {
  module.exports = require('typescript');
}
catch (e) {
  module.exports = require('./typescript.js');
}
`);
  writeFileSync(__dirname + "/../dist/ncc/sourcemap-register.js", sourcemapSupport);
  writeFileSync(__dirname + "/../dist/ncc/typescript/typescript.js", typescript);
  writeFileSync(__dirname + "/../dist/ncc/loaders/node-loader.js", nodeLoader);
  writeFileSync(__dirname + "/../dist/ncc/loaders/relocate-loader.js", relocateLoader);
  writeFileSync(__dirname + "/../dist/ncc/loaders/shebang-loader.js", shebangLoader);
  writeFileSync(__dirname + "/../dist/ncc/loaders/ts-loader.js", tsLoader);
  writeFileSync(__dirname + "/../dist/ncc/loaders/uncacheable.js", readFileSync(__dirname + "/../src/loaders/uncacheable.js"));

  // copy typescript types
  await copy(
    __dirname + "/../node_modules/typescript/lib/*.ts",
    __dirname + "/../dist/ncc/loaders/lib/"
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
