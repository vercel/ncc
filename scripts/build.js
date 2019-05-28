const ncc = require("../src/index.js");
const { statSync, writeFileSync, readFileSync, unlinkSync } = require("fs");
const { promisify } = require("util");
const { relative } = require("path");
const copy = promisify(require("copy"));
const glob = promisify(require("glob"));
const bytes = require("bytes");

function assetList (files) {
  return Object.keys(files).filter(file => file.startsWith('assets/')).map(file => file.substr(7));
}

async function main() {
  for (const file of await glob(__dirname + "/../dist/**/*.@(js|cache|ts)")) {
    unlinkSync(file);
  }

  const { files: cliFiles } = await ncc(
    { 'cli': __dirname + "/../src/cli" },
    {
      externals: ["./index.js"],
      minify: true,
      v8cache: true
    }
  );
  checkUnknownAssets('cli', assetList(cliFiles));

  const { files: indexFiles } = await ncc(
    { 'index': __dirname + "/../src/index" },
    {
      // we dont care about watching, so we don't want
      // to bundle it. even if we did want watching and a bigger
      // bundle, webpack (and therefore ncc) cannot currently bundle
      // chokidar, which is quite convenient
      externals: ["chokidar"],
      minify: true,
      v8cache: true
    }
  );
  checkUnknownAssets('index', assetList(indexFiles).filter(asset => !asset.startsWith('locales/') && asset !== 'worker.js' && asset !== 'index.js'));

  const { files: relocateLoaderFiles } = await ncc(
    { 'relocate-loader': __dirname + "/../src/loaders/relocate-loader",},
    { minify: true, v8cache: true }
  );
  checkUnknownAssets('relocate-loader', assetList(relocateLoaderFiles));

  const { files: shebangLoaderFiles } = await ncc(
    { 'shebang-loader': __dirname + "/../src/loaders/shebang-loader" },
    { minify: true, v8cache: true }
  );
  checkUnknownAssets('shebang-loader', assetList(shebangLoaderFiles));

  const { files: tsLoaderFiles } = await ncc(
    { 'ts-loader': __dirname + "/../src/loaders/ts-loader" },
    { minify: true, v8cache: true }
  );
  checkUnknownAssets('ts-loader', assetList(tsLoaderFiles).filter(asset => !asset.startsWith('lib/') && !asset.startsWith('typescript/lib')));

  const { files: sourceMapSupportFiles } = await ncc(
    { 'sourcemap-register': require.resolve("source-map-support/register") },
    { minifiy: true, v8cache: true }
  );
  checkUnknownAssets('source-map-support/register', assetList(sourceMapSupportFiles));

  // detect unexpected asset emissions from core build
  function checkUnknownAssets (buildName, assets) {
    assets = assets.filter(name => !name.endsWith('.cache') && !name.endsWith('.cache.js'));
    if (!assets.length) return;
    console.error(`New assets are being emitted by the ${buildName} build`);
    console.log(assets);
  }

  writeFileSync(__dirname + "/../dist/ncc/cli.js.cache", cliFiles["cli.js.cache"].source);
  writeFileSync(__dirname + "/../dist/ncc/index.js.cache", indexFiles["index.js.cache"].source);
  writeFileSync(__dirname + "/../dist/ncc/sourcemap-register.js.cache", sourceMapSupportFiles["sourcemap-register.js.cache"].source);
  writeFileSync(__dirname + "/../dist/ncc/loaders/relocate-loader.js.cache", relocateLoaderFiles["relocate-loader.js.cache"].source);
  writeFileSync(__dirname + "/../dist/ncc/loaders/shebang-loader.js.cache", shebangLoaderFiles["shebang-loader.js.cache"].source);
  writeFileSync(__dirname + "/../dist/ncc/loaders/ts-loader.js.cache", tsLoaderFiles["ts-loader.js.cache"].source);

  writeFileSync(__dirname + "/../dist/ncc/cli.js.cache.js", cliFiles["cli.js.cache.js"].source);
  writeFileSync(__dirname + "/../dist/ncc/index.js.cache.js", indexFiles["index.js.cache.js"].source);
  writeFileSync(__dirname + "/../dist/ncc/sourcemap-register.js.cache.js", sourceMapSupportFiles["sourcemap-register.js.cache.js"].source);
  writeFileSync(__dirname + "/../dist/ncc/loaders/relocate-loader.js.cache.js", relocateLoaderFiles["relocate-loader.js.cache.js"].source);
  writeFileSync(__dirname + "/../dist/ncc/loaders/shebang-loader.js.cache.js", shebangLoaderFiles["shebang-loader.js.cache.js"].source);
  writeFileSync(__dirname + "/../dist/ncc/loaders/ts-loader.js.cache.js", tsLoaderFiles["ts-loader.js.cache.js"].source);

  writeFileSync(__dirname + "/../dist/ncc/cli.js", cliFiles["cli.js"].source, { mode: 0o777 });
  writeFileSync(__dirname + "/../dist/ncc/index.js", indexFiles["index.js"].source);
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
  writeFileSync(__dirname + "/../dist/ncc/sourcemap-register.js", sourceMapSupportFiles["sourcemap-register.js"].source);
  writeFileSync(__dirname + "/../dist/ncc/loaders/relocate-loader.js", relocateLoaderFiles["relocate-loader.js"].source);
  writeFileSync(__dirname + "/../dist/ncc/loaders/shebang-loader.js", shebangLoaderFiles["shebang-loader.js"].source);
  writeFileSync(__dirname + "/../dist/ncc/loaders/ts-loader.js", tsLoaderFiles["ts-loader.js"].source);
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
