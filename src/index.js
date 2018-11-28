const resolve = require("resolve");
const fs = require("fs");
const path = require("path");
const webpack = require("webpack");
const MemoryFS = require("memory-fs");
const WebpackParser = require('webpack/lib/Parser');
const webpackParse = WebpackParser.parse

// overload the webpack parser so that we can make
// acorn work with the node.js / commonjs semantics
// of being able to `return` in the top level of a
// requireable module
// https://github.com/zeit/ncc/issues/40
WebpackParser.parse = function (source, opts = {}) {
  return webpackParse.call(this, source, {
    ...opts,
    allowReturnOutsideFunction: true
  });
}

const SUPPORTED_EXTENSIONS = [".mjs", ".js", ".json"];

function resolveModule(context, request, callback, forcedExternals = []) {
  const resolveOptions = {
    basedir: context,
    preserveSymlinks: true,
    extensions: SUPPORTED_EXTENSIONS
  };

  if (new Set(forcedExternals).has(request)) {
    console.error(`ncc: Skipping bundling "${request}" per config`);
    return callback(null, `commonjs ${request}`);
  }

  resolve(request, resolveOptions, err => {
    if (err) {
      console.error(
        `ncc: Module directory "${context}" attempted to require "${request}" but could not be resolved, assuming external.`
      );
      return callback(null, `commonjs ${request}`);
    }

    callback();
  });
}

module.exports = async (entry, { externals = [], minify = true, sourceMap = false } = {}) => {
  const mfs = new MemoryFS();
  const compiler = webpack({
    entry,
    optimization: {
      nodeEnv: false,
      minimize: false
    },
    devtool: sourceMap ? "cheap-source-map" : false,
    mode: "production",
    target: "node",
    output: {
      path: "/",
      filename: "out.js",
      libraryTarget: "commonjs2"
    },
    resolve: {
      extensions: SUPPORTED_EXTENSIONS,
      // webpack defaults to `module` and `main`, but that's
      // not really what node.js supports, so we reset it
      mainFields: ["main"]
    },
    // https://github.com/zeit/ncc/pull/29#pullrequestreview-177152175
    node: false,
    externals: (...args) => resolveModule(...[...args, externals]),
    module: {
      rules: [
        {
          parser: { amd: false }
        },
        {
          test: /\.(js|mjs)/,
          use: [{ loader: __dirname + "/asset-relocator.js" }]
        }
      ]
    },
    plugins: [
      {
        apply(compiler) {
          // override "not found" context to try built require first
          compiler.hooks.compilation.tap("ncc", compilation => {
            compilation.moduleTemplates.javascript.hooks.render.tap("ncc", (moduleSourcePostModule, module, options, dependencyTemplates) => {
              if (module._contextDependencies &&
                  moduleSourcePostModule._value.match(/webpackEmptyAsyncContext|webpackEmptyContext/)) {
                return moduleSourcePostModule._value.replace('var e = new Error',
                    `try { return require(req) }\ncatch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e }` + 
                    `\nvar e = new Error`);
              }
            });
          });

          compiler.hooks.normalModuleFactory.tap("ncc", NormalModuleFactory => {
            function handler(parser) {
              parser.hooks.assign.for("require").intercept({
                register: tapInfo => {
                  if (tapInfo.name !== "CommonJsPlugin") {
                    return tapInfo;
                  }
                  tapInfo.fn = () => {};
                  return tapInfo;
                }
              });
            }
            NormalModuleFactory.hooks.parser
              .for("javascript/auto")
              .tap("ncc", handler);
            NormalModuleFactory.hooks.parser
              .for("javascript/dynamic")
              .tap("ncc", handler);

            return NormalModuleFactory;
          });
        }
      }
    ]
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
      const assets = Object.create(null);
      getFlatFiles(mfs.data, assets);
      delete assets["out.js"];
      delete assets["out.js.map"];
      const code = mfs.readFileSync("/out.js", "utf8");
      const map = sourceMap ? mfs.readFileSync("/out.js.map", "utf8") : null;
      resolve({
        code,
        map,
        assets
      });
    });
  });
};

// this could be rewritten with actual FS apis / globs, but this is simpler
function getFlatFiles (mfsData, output, curBase = '') {
  for (const path of Object.keys(mfsData)) {
    const item = mfsData[path];
    const curPath = curBase + '/' + path;
    // directory
    if (item[""] === true)
      getFlatFiles(item, output, curPath);
    // file
    else if (!curPath.endsWith("/"))
      output[curPath.substr(1)] = mfsData[path];
  }
}
