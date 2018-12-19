const resolve = require("resolve");
const fs = require("graceful-fs");
const webpack = require("webpack");
const MemoryFS = require("memory-fs");
const WebpackParser = require("webpack/lib/Parser");
const webpackParse = WebpackParser.parse;
const terser = require("terser");
const tsconfigPaths = require("tsconfig-paths");
const TsconfigPathsPlugin = require("tsconfig-paths-webpack-plugin");
const shebangRegEx = require('./utils/shebang');
const { pkgNameRegEx } = require("./utils/get-package-base");

const nodeBuiltins = new Set([...require("repl")._builtinLibs, "constants", "module", "timers", "console", "_stream_writable", "_stream_readable", "_stream_duplex"]);

// overload the webpack parser so that we can make
// acorn work with the node.js / commonjs semantics
// of being able to `return` in the top level of a
// requireable module
// https://github.com/zeit/ncc/issues/40
WebpackParser.parse = function(source, opts = {}) {
  return webpackParse.call(this, source, {
    ...opts,
    allowReturnOutsideFunction: true
  });
};

const SUPPORTED_EXTENSIONS = [".js", ".json", ".node", ".mjs", ".ts", ".tsx"];

module.exports = async (
  entry,
  {
    externals = [],
    minify = true,
    sourceMap = false,
    filename = "index.js"
  } = {}
) => {
  const shebangMatch = fs.readFileSync(resolve.sync(entry)).toString().match(shebangRegEx);
  const mfs = new MemoryFS();
  const assetNames = Object.create(null);
  const assets = Object.create(null);
  const resolvePlugins = [];
  let tsconfigMatchPath;
  // add TsconfigPathsPlugin to support `paths` resolution in tsconfig
  // we need to catch here because the plugin will
  // error if there's no tsconfig in the working directory
  try {
    resolvePlugins.push(new TsconfigPathsPlugin({ silent: true }));

    const tsconfig = tsconfigPaths.loadConfig();
    if (tsconfig.resultType === "success") {
      tsconfigMatchPath = tsconfigPaths.createMatchPath(tsconfig.absoluteBaseUrl, tsconfig.paths);
    }
  } catch (e) {}

  const externalSet = new Set(externals);

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
      filename,
      libraryTarget: "commonjs2"
    },
    resolve: {
      extensions: SUPPORTED_EXTENSIONS,
      // webpack defaults to `module` and `main`, but that's
      // not really what node.js supports, so we reset it
      mainFields: ["main"],
      plugins: resolvePlugins
    },
    // https://github.com/zeit/ncc/pull/29#pullrequestreview-177152175
    node: false,
    externals: async (context, request, callback) => {
      if (externalSet.has(request)) return callback(null, `commonjs ${request}`);
      if (request[0] === "." && (request[1] === "/" || request[1] === "." && request[2] === "/")) {
        if (request.startsWith("./node_modules/")) request = request.substr(15);
        else if (request.startsWith("../node_modules/")) request = request.substr(16);
        else return callback();
      }
      if (request[0] === "/" || nodeBuiltins.has(request) ||
          tsconfigMatchPath && tsconfigMatchPath(request, undefined, undefined, SUPPORTED_EXTENSIONS))
        return callback();
      const pkgNameMatch = request.match(pkgNameRegEx);
      if (pkgNameMatch) request = pkgNameMatch[0];
      let pkgPath = context + '/node_modules/' + request;
      do {
        if (await new Promise((resolve, reject) =>
          fs.stat(pkgPath, (err, stats) =>
            err && err.code !== 'ENOENT' ? reject(err) : resolve(stats ? stats.isDirectory() : false)
          )
        ))
          return callback();
      } while (pkgPath.length > (pkgPath = pkgPath.substr(0, pkgPath.lastIndexOf('/', pkgPath.length - 15 - request.length)) + '/node_modules/' + request).length);
      console.error(`ncc: Module directory "${context}" attempted to require "${request}" but could not be resolved, assuming external.`);
      return callback(null, `commonjs ${request}`);
    },
    module: {
      rules: [
        {
          parser: { amd: false },
          use: [{
            loader: __dirname + "/loaders/shebang-loader.js"
          }]
        },
        {
          test: /\.node$/,
          use: [{
            loader: __dirname + "/loaders/node-loader.js",
            options: { assetNames, assets }
          }]
        },
        {
          test: /\.(js|mjs|tsx?)$/,
          use: [{
            loader: __dirname + "/loaders/relocate-loader.js",
            options: { assetNames, assets }
          }]
        },
        {
          test: /\.tsx?$/,
          use: [{
            loader: __dirname + "/loaders/ts-loader.js",
            options: {
              compilerOptions: {
                outDir: '//'
              }
            }
          }]
        }
      ]
    },
    plugins: [
      {
        apply(compiler) {
          // override "not found" context to try built require first
          compiler.hooks.compilation.tap("ncc", compilation => {
            compilation.moduleTemplates.javascript.hooks.render.tap(
              "ncc",
              (
                moduleSourcePostModule,
                module,
                options,
                dependencyTemplates
              ) => {
                if (
                  module._contextDependencies &&
                  moduleSourcePostModule._value.match(
                    /webpackEmptyAsyncContext|webpackEmptyContext/
                  )
                ) {
                  module.type = 'HACK'; // hack to ensure __webpack_require__ is added to wrapper
                  return moduleSourcePostModule._value.replace(
                    "var e = new Error",
                    `if (typeof req === 'number' && __webpack_require__.m[req])\n` +
                    `  return __webpack_require__(req);\n` +
                    `try { return require(req) }\n` +
                    `catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e }\n` +
                    `var e = new Error`
                  );
                }
              }
            );
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
  // tsconfig-paths-webpack-plugin requires a readJson method on the filesystem
  compiler.inputFileSystem.readJson = (path, callback) => {
    compiler.inputFileSystem.readFile(path, (err, data) => {
      if (err) {
        callback(err);
        return;
      }

      try {
        callback(null, JSON.parse(data));
      } catch (e) {
        callback(e);
      }
    });
  };
  compiler.resolvers.normal.fileSystem = mfs;
  return new Promise((resolve, reject) => {
    compiler.run((err, stats) => {
      if (err) return reject(err);
      if (stats.hasErrors()) {
        return reject(new Error(stats.toString()));
      }
      const assets = Object.create(null);
      getFlatFiles(mfs.data, assets);
      delete assets[filename];
      delete assets[filename + ".map"];
      const code = mfs.readFileSync("/index.js", "utf8");
      const map = sourceMap ? mfs.readFileSync("/index.js.map", "utf8") : null;
      resolve({
        code,
        map,
        assets
      });
    });
  })
  .then(({ code, map, assets }) => {
    if (!minify)
      return { code, map, assets };
    const result = terser.minify(code, {
      compress: false,
      mangle: {
        keep_classnames: true,
        keep_fnames: true
      },
      sourceMap: sourceMap ? {
        content: map,
        filename,
        url: filename + ".map"
      } : false
    });
    // For some reason, auth0 returns "undefined"!
    // custom terser phase used over Webpack integration for this reason
    if (result.code === undefined)
      return { code, map, assets };
    return { code: result.code, map: result.map, assets };
  })
  .then(({ code, map, assets}) => {
    if (!shebangMatch)
      return { code, map, assets };
    code = shebangMatch[0] + code;
    // add a line offset to the sourcemap
    if (map)
      map.mappings = ";" + map.mappings;
    return { code, map, assets };
  })
};

// this could be rewritten with actual FS apis / globs, but this is simpler
function getFlatFiles(mfsData, output, curBase = "") {
  for (const path of Object.keys(mfsData)) {
    const item = mfsData[path];
    const curPath = curBase + "/" + path;
    // directory
    if (item[""] === true) getFlatFiles(item, output, curPath);
    // file
    else if (!curPath.endsWith("/")) output[curPath.substr(1)] = mfsData[path];
  }
}
