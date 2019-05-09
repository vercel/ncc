const ncc = require("../src/index.js");
const { statSync, writeFileSync, readFileSync, unlinkSync } = require("fs");
const { promisify } = require("util");
const { relative } = require("path");
const copy = promisify(require("copy"));
const glob = promisify(require("glob"));
const bytes = require("bytes");

async function main() {
  for (const file of await glob(__dirname + "/../dist/**/*.@(js|cache|ts)")) {
    unlinkSync(file);
  }

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
      filename: "ts-loader.js",
      minify: true,
      v8cache: true
    }
  );

  const { code: sourcemapSupport, assets: sourcemapAssets } = await ncc(
    require.resolve("source-map-support/register"),
    { filename: "sourcemap-register.js", minfiy: true, v8cache: true }
  );

  // detect unexpected asset emissions from core build
  const unknownAssets = [
    ...Object.keys(cliAssets),
    ...Object.keys(indexAssets).filter(asset => !asset.startsWith('locales/')),
    ...Object.keys(relocateLoaderAssets),
    ...Object.keys(shebangLoaderAssets),
    ...Object.keys(tsLoaderAssets).filter(asset => !asset.startsWith('lib/')),
    ...Object.keys(sourcemapAssets)
  ].filter(asset => !asset.endsWith('.js.cache') && !asset.endsWith('.cache.js'));
  
  if (unknownAssets.length) {
    console.error("New assets are being emitted by the core build");
    console.log(unknownAssets);
  }

  writeFileSync(__dirname + "/../dist/ncc/cli.js.cache", cliAssets["cli.js.cache"].source);
  writeFileSync(__dirname + "/../dist/ncc/index.js.cache", indexAssets["index.js.cache"].source);
  writeFileSync(__dirname + "/../dist/ncc/sourcemap-register.js.cache", sourcemapAssets["sourcemap-register.js.cache"].source);
  writeFileSync(__dirname + "/../dist/ncc/loaders/relocate-loader.js.cache", relocateLoaderAssets["relocate-loader.js.cache"].source);
  writeFileSync(__dirname + "/../dist/ncc/loaders/shebang-loader.js.cache", shebangLoaderAssets["shebang-loader.js.cache"].source);
  writeFileSync(__dirname + "/../dist/ncc/loaders/ts-loader.js.cache", tsLoaderAssets["ts-loader.js.cache"].source);

  writeFileSync(__dirname + "/../dist/ncc/cli.js.cache.js", cliAssets["cli.js.cache.js"].source);
  writeFileSync(__dirname + "/../dist/ncc/index.js.cache.js", indexAssets["index.js.cache.js"].source);
  writeFileSync(__dirname + "/../dist/ncc/sourcemap-register.js.cache.js", sourcemapAssets["sourcemap-register.js.cache.js"].source);
  writeFileSync(__dirname + "/../dist/ncc/loaders/relocate-loader.js.cache.js", relocateLoaderAssets["relocate-loader.js.cache.js"].source);
  writeFileSync(__dirname + "/../dist/ncc/loaders/shebang-loader.js.cache.js", shebangLoaderAssets["shebang-loader.js.cache.js"].source);
  writeFileSync(__dirname + "/../dist/ncc/loaders/ts-loader.js.cache.js", tsLoaderAssets["ts-loader.js.cache.js"].source);

  writeFileSync(__dirname + "/../dist/ncc/cli.js", cli, { mode: 0o777 });
  writeFileSync(__dirname + "/../dist/ncc/index.js", index);
  writeFileSync(__dirname + "/../dist/ncc/typescript.js", `
const { Module } = require('module');
const m = new Module('', null);
m.paths = Module._nodeModulePaths(process.env.TYPESCRIPT_LOOKUP_PATH || (process.cwd() + '/'));
let typescript;
try {
  typescript = m.require('typescript');
  console.log("ncc: Using typescript@" + typescript.version + " (local user-provided)");
}
catch (e) {
  typescript = require('./loaders/ts-loader.js').typescript;
  console.log("ncc: Using typescript@" + typescript.version + " (ncc built-in)");
}
module.exports = typescript;
`);
  writeFileSync(__dirname + "/../dist/ncc/sourcemap-register.js", sourcemapSupport);
  writeFileSync(__dirname + "/../dist/ncc/loaders/relocate-loader.js", relocateLoader);
  writeFileSync(__dirname + "/../dist/ncc/loaders/shebang-loader.js", shebangLoader);
  writeFileSync(__dirname + "/../dist/ncc/loaders/ts-loader.js", tsLoader);
  writeFileSync(__dirname + "/../dist/ncc/loaders/uncacheable.js", readFileSync(__dirname + "/../src/loaders/uncacheable.js"));
  writeFileSync(__dirname + "/../dist/ncc/loaders/empty-loader.js", readFileSync(__dirname + "/../src/loaders/empty-loader.js"));
  writeFileSync(__dirname + "/../dist/ncc/loaders/notfound-loader.js", readFileSync(__dirname + "/../src/loaders/notfound-loader.js"));
  writeFileSync(__dirname + "/../dist/ncc/@@notfound.js", readFileSync(__dirname + "/../src/@@notfound.js"));

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
