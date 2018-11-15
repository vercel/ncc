const path = require("path");
const fs = require("fs");
const webpack = require("./webpack");
const MemoryFS = require("memory-fs");

module.exports = async (entry, { minify = true } = {}) => {
  const mfs = new MemoryFS();
  const compiler = webpack({
    entry,
    optimization: {
      minimize: false
    },
    mode: "production",
    target: "node",
    output: {
      path: "/",
      filename: "out.js",
      libraryTarget: "commonjs2"
    }
  });
  compiler.inputFileSystem = fs;
  compiler.outputFileSystem = mfs;
  compiler.resolvers.normal.fileSystem = mfs;
  return new Promise((resolve, reject) => {
    compiler.run((err, stats) => {
      if (err) return reject(err);
      if (stats.hasErrors()) {
        return reject(new Error(stats.toString()));
      }
      resolve(mfs.readFileSync("/out.js", "utf8"));
    });
  });
};
