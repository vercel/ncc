const resolve = require("resolve");
const fs = require("fs");
const webpack = require("./webpack/lib/webpack");
const MemoryFS = require("memory-fs");

const SUPPORTED_EXTENSIONS = ['.js', '.json']

function resolveModule (context, request, callback) {
  const resolveOptions = {
    basedir: context,
    preserveSymlinks: true,
    extensions: SUPPORTED_EXTENSIONS
  }

  resolve(request, resolveOptions, (err) => {
    if (err) {
      console.error(`Module directory "${context}" attempted to require "${request}" but could not be resolved, assuming external.`)
      return callback(null, `commonjs ${request}`)
    }

    callback()
  })
}

module.exports = async (entry, { minify = true } = {}) => {
  const mfs = new MemoryFS();
  const compiler = webpack({
    entry,
    optimization: {
      nodeEnv: false,
      minimize: false
    },
    mode: "production",
    target: "node",
    output: {
      path: "/",
      filename: "out.js",
      libraryTarget: "commonjs2"
    },
    resolve: {
      extensions: SUPPORTED_EXTENSIONS
    },
    externals: resolveModule,
    plugins: [
      {
        apply(compiler) {
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
      resolve(mfs.readFileSync("/out.js", "utf8"));
    });
  });
};
