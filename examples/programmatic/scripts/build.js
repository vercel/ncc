const { statSync, writeFileSync } = require("fs");
const { basename, relative, resolve } = require("path");
const { promisify } = require("util");

const bytes = require("bytes");
const glob = promisify(require("glob"));
const mkdirp = promisify(require("mkdirp"));
const ncc = require("@vercel/ncc");

// output directories
const DIST_DIR = resolve(__dirname, "../dist");
const CACHE_DIR = resolve(DIST_DIR, ".cache");

// options for ncc with mix of defaults and customization
const options = {
  // provide a custom cache path
  cache: CACHE_DIR,
  // externals to leave as requires of the build
  externals: [],
  minify: true,
  sourceMap: true,
  watch: false // default
};

// write file to disk and print final size
function write(file, data) {
  writeFileSync(file, data);

  console.log(
    `✓ ${relative(__dirname + "/../", file)} (${bytes(statSync(file).size)})`
  );
}

// build file with its dependencies using ncc
async function build(file) {
  const { code, map, assets } = await ncc(file, options);

  if (Object.keys(assets).length)
    console.error("New unexpected assets are being emitted for", file);

  const name = basename(file, ".js");
  await mkdirp(resolve(DIST_DIR, name));
  write(resolve(DIST_DIR, name, "index.js"), code);
  write(resolve(DIST_DIR, name, "index.map.js"), map);
}

async function main() {
  // create our output and custom cache directories
  await mkdirp(CACHE_DIR);

  // find all routes we want to bundle
  const files = await glob(resolve(__dirname, "../src/routes/*.js"));

  // build all found files
  return Promise.all(files.map(build));
}

main();
