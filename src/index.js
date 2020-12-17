const resolve = require("resolve");
const fs = require("graceful-fs");
const crypto = require("crypto");
const { join, dirname, extname, relative } = require("path");
const webpack = require("webpack");
const MemoryFS = require("memory-fs");
const terser = require("terser");
const tsconfigPaths = require("tsconfig-paths");
const { loadTsconfig } = require("tsconfig-paths/lib/tsconfig-loader");
const TsconfigPathsPlugin = require("tsconfig-paths-webpack-plugin");
const shebangRegEx = require('./utils/shebang');
const nccCacheDir = require("./utils/ncc-cache-dir");
const LicenseWebpackPlugin = require('license-webpack-plugin').LicenseWebpackPlugin;
const { version: nccVersion } = require('../package.json');

// support glob graceful-fs
fs.gracefulify(require("fs"));

const SUPPORTED_EXTENSIONS = [".js", ".json", ".node", ".mjs", ".ts", ".tsx"];

const hashOf = name => {
  return crypto
		.createHash("md4")
		.update(name)
		.digest("hex")
		.slice(0, 10);
}

const defaultPermissions = 0o666;

const relocateLoader = eval('require(__dirname + "/loaders/relocate-loader.js")');

module.exports = ncc;
function ncc (
  entry,
  {
    cache,
    externals = [],
    filename = 'index' + (entry.endsWith('.cjs') ? '.cjs' : '.js'),
    minify = false,
    sourceMap = false,
    sourceMapRegister = true,
    sourceMapBasePrefix = '../',
    noAssetBuilds = false,
    watch = false,
    v8cache = false,
    filterAssetBase = process.cwd(),
    existingAssetNames = [],
    quiet = false,
    debugLog = false,
    transpileOnly = false,
    license = '',
    target
  } = {}
) {
  process.env.__NCC_OPTS = JSON.stringify({
    quiet
  });
  const ext = extname(filename);

  if (!quiet) {
    console.log(`ncc: Version ${nccVersion}`);
    console.log(`ncc: Compiling file ${filename}`);
  }

  if (target && !target.startsWith('es')) {
    throw new Error(`Invalid "target" value provided ${target}, value must be es version e.g. es5`)
  }

  const resolvedEntry = resolve.sync(entry);
  process.env.TYPESCRIPT_LOOKUP_PATH = resolvedEntry;
  const shebangMatch = fs.readFileSync(resolvedEntry).toString().match(shebangRegEx);
  const mfs = new MemoryFS();

  existingAssetNames.push(filename);
  if (sourceMap) {
    existingAssetNames.push(`${filename}.map`);
    existingAssetNames.push(`sourcemap-register${ext}`);
  }
  if (v8cache) {
    existingAssetNames.push(`${filename}.cache`);
    existingAssetNames.push(`${filename}.cache${ext}`);
  }
  const resolvePlugins = [];
  // add TsconfigPathsPlugin to support `paths` resolution in tsconfig
  // we need to catch here because the plugin will
  // error if there's no tsconfig in the working directory
  try {
    const tsconfig = tsconfigPaths.loadConfig();
    const fullTsconfig = loadTsconfig(tsconfig.configFileAbsolutePath)

    const tsconfigPathsOptions = { silent: true }
    if (fullTsconfig.compilerOptions.allowJs) {
      tsconfigPathsOptions.extensions = SUPPORTED_EXTENSIONS
    }
    resolvePlugins.push(new TsconfigPathsPlugin(tsconfigPathsOptions));

    if (tsconfig.resultType === "success") {
      tsconfigMatchPath = tsconfigPaths.createMatchPath(tsconfig.absoluteBaseUrl, tsconfig.paths);
    }
  } catch (e) {}

  resolvePlugins.push({
    apply(resolver) {
      const resolve = resolver.resolve;
      resolver.resolve = function (context, path, request, resolveContext, callback) {
        const self = this;
        resolve.call(self, context, path, request, resolveContext, function (err, innerPath, result) {
          if (result) return callback(null, innerPath, result);
          if (err && !err.message.startsWith('Can\'t resolve'))
            return callback(err);
          // Allow .js resolutions to .tsx? from .tsx?
          if (request.endsWith('.js') && context.issuer && (context.issuer.endsWith('.ts') || context.issuer.endsWith('.tsx'))) {
            return resolve.call(self, context, path, request.slice(0, -3), resolveContext, function (err, innerPath, result) {
              if (result) return callback(null, innerPath, result);
              if (err && !err.message.startsWith('Can\'t resolve'))
                return callback(err);
              // make not found errors runtime errors
              callback(null, __dirname + '/@@notfound.js?' + (externalMap.get(request) || request), request);
            });
          }
          // make not found errors runtime errors
          callback(null, __dirname + '/@@notfound.js?' + (externalMap.get(request) || request), request);
        });
      };
    }
  });

  const externalMap = new Map();

  if (Array.isArray(externals))
    externals.forEach(external => externalMap.set(external, external));
  else if (typeof externals === 'object')
    Object.keys(externals).forEach(external => externalMap.set(external, externals[external]));

  let watcher, watchHandler, rebuildHandler;

  const compilationStack = [];

  var plugins = [
    {
      apply(compiler) {
        compiler.hooks.compilation.tap("relocate-loader", compilation => {
          compilationStack.push(compilation);
          relocateLoader.initAssetCache(compilation);
        });
        compiler.hooks.watchRun.tap("ncc", () => {
          if (rebuildHandler)
            rebuildHandler();
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

  if (typeof license === 'string' && license.length > 0)
  {
    plugins.push(new LicenseWebpackPlugin({
      outputFilename: license
    }));
  }

  const compiler = webpack({
    entry,
    cache: cache === false ? undefined : {
      type: "filesystem",
      cacheDirectory: typeof cache === 'string' ? cache : nccCacheDir,
      name: `ncc_${hashOf(entry)}`,
      version: nccVersion
    },
    amd: false,
    optimization: {
      nodeEnv: false,
      minimize: false,
      moduleIds: 'deterministic',
      chunkIds: 'deterministic',
      mangleExports: true,
      concatenateModules: true,
      innerGraph: true,
      sideEffects: true
    },
    devtool: sourceMap ? "cheap-module-source-map" : false,
    mode: "production",
    target: target ? ["node", target] : "node",
    stats: {
      logging: 'error'
    },
    infrastructureLogging: {
      level: 'error'
    },
    output: {
      path: "/",
      // Webpack only emits sourcemaps for files ending in .js
      filename: ext === '.cjs' ? filename + '.js' : filename,
      libraryTarget: "commonjs2",
      strictModuleExceptionHandling: true
    },
    resolve: {
      extensions: SUPPORTED_EXTENSIONS,
      // webpack defaults to `module` and `main`, but that's
      // not really what node.js supports, so we reset it
      mainFields: ["main"],
      plugins: resolvePlugins
    },
    // https://github.com/vercel/ncc/pull/29#pullrequestreview-177152175
    node: false,
    externals: async ({ context, request }, callback) => {
      if (externalMap.has(request)) return callback(null, `commonjs ${externalMap.get(request)}`);
      return callback();
    },
    module: {
      rules: [
        {
          test: /@@notfound\.js$/,
          use: [{
            loader: eval('__dirname + "/loaders/notfound-loader.js"')
          }]
        },
        {
          test: /\.(js|mjs|tsx?|node)$/,
          use: [{
            loader: eval('__dirname + "/loaders/empty-loader.js"')
          }, {
            loader: eval('__dirname + "/loaders/relocate-loader.js"'),
            options: {
              filterAssetBase,
              existingAssetNames,
              escapeNonAnalyzableRequires: true,
              wrapperCompatibility: true,
              debugLog
            }
          }]
        },
        {
          test: /\.tsx?$/,
          use: [{
            loader: eval('__dirname + "/loaders/uncacheable.js"')
          },
          {
            loader: eval('__dirname + "/loaders/ts-loader.js"'),
            options: {
              transpileOnly,
              compiler: eval('__dirname + "/typescript.js"'),
              compilerOptions: {
                outDir: '//',
                noEmit: false
              }
            }
          }]
        },
        {
          parser: { amd: false },
          exclude: /\.(node|json)$/,
          use: [{
            loader: eval('__dirname + "/loaders/shebang-loader.js"')
          }]
        }
      ]
    },
    plugins
  });
  compiler.outputFileSystem = mfs;
  if (!watch) {
    return new Promise((resolve, reject) => {
      compiler.run((err, stats) => {
        if (err) return reject(err);
        compiler.close(err => {
          if (err) return reject(err);
          if (stats.hasErrors()) {
            const errLog = stats.compilation.errors.map(err => err.message).join('\n');
            return reject(new Error(errLog));
          }
          resolve(stats);
        });
      });
    })
    .then(finalizeHandler, function (err) {
      compilationStack.pop();
      throw err;
    });
  }
  else {
    if (typeof watch === 'object') {
      if (!watch.watch)
        throw new Error('Watcher class must be a valid Webpack WatchFileSystem class instance (https://github.com/webpack/webpack/blob/master/lib/node/NodeWatchFileSystem.js)');
      compiler.watchFileSystem = watch;
      watch.inputFileSystem = compiler.inputFileSystem;
    }
    let cachedResult;
    watcher = compiler.watch({}, async (err, stats) => {
      if (err) {
        compilationStack.pop();
        return watchHandler({ err });
      }
      if (stats.hasErrors()) {
        compilationStack.pop();
        return watchHandler({ err: stats.toString() });
      }
      const returnValue = await finalizeHandler(stats);
      if (watchHandler)
        watchHandler(returnValue);
      else
        cachedResult = returnValue;
    });
    let closed = false;
    return {
      close () {
        if (!watcher)
          throw new Error('No watcher to close.');
        if (closed)
          throw new Error('Watcher already closed.');
        closed = true;
        watcher.close();
      },
      handler (handler) {
        if (watchHandler)
          throw new Error('Watcher handler already provided.');
        watchHandler = handler;
        if (cachedResult) {
          handler(cachedResult);
          cachedResult = null;
        }
      },
      rebuild (handler) {
        if (rebuildHandler)
          throw new Error('Rebuild handler already provided.');
        rebuildHandler = handler;
      }
    };
  }

  async function finalizeHandler (stats) {
    const assets = Object.create(null);
    getFlatFiles(mfs.data, assets, relocateLoader.getAssetMeta);
    // filter symlinks to existing assets
    const symlinks = Object.create(null);
    for (const [key, value] of Object.entries(relocateLoader.getSymlinks())) {
      const resolved = join(dirname(key), value);
      if (resolved in assets)
        symlinks[key] = value;
    }

    // Webpack only emits sourcemaps for .js files
    // so we need to adjust the .cjs extension handling
    delete assets[filename + (ext === '.cjs' ? '.js' : '')];
    delete assets[`${filename}${ext === '.cjs' ? '.js' : ''}.map`];
    let code = mfs.readFileSync(`/${filename}${ext === '.cjs' ? '.js' : ''}`, "utf8");
    let map = sourceMap ? mfs.readFileSync(`/${filename}${ext === '.cjs' ? '.js' : ''}.map`, "utf8") : null;

    if (map) {
      map = JSON.parse(map);
      // make source map sources relative to output
      map.sources = map.sources.map(source => {
        // webpack:///webpack:/// happens too for some reason
        while (source.startsWith('webpack:///'))
          source = source.slice(11);
        if (source.startsWith('//'))
          source = source.slice(1);
        if (source.startsWith('/'))
          source = relative(process.cwd(), source).replace(/\\/g, '/');
        if (source.startsWith('external '))
          source = 'node:' + source.slice(9);
        if (source.startsWith('./'))
          source = source.slice(2);
        if (source.startsWith('(webpack)'))
          source = 'webpack' + source.slice(9);
        if (source.startsWith('webpack/'))
          return '/webpack/' + source.slice(8);
        return sourceMapBasePrefix + source;
      });
    }

    if (minify) {
      const result = terser.minify(code, {
        compress: false,
        mangle: {
          keep_classnames: true,
          keep_fnames: true
        },
        sourceMap: sourceMap ? {
          content: map,
          filename,
          url: `${filename}.map`
        } : false
      });
      // For some reason, auth0 returns "undefined"!
      // custom terser phase used over Webpack integration for this reason
      if (result.code !== undefined)
        ({ code, map } = {
          code: result.code,
          map: sourceMap ? JSON.parse(result.map) : undefined
        });
    }

    if (v8cache) {
      const { Script } = require('vm');
      assets[`${filename}.cache`] = { source: new Script(code).createCachedData(), permissions: defaultPermissions };
      assets[`${filename}.cache${ext}`] = { source: code, permissions: defaultPermissions };
      if (map) {
        assets[filename + '.map'] = { source: JSON.stringify(map), permissions: defaultPermissions };
        map = undefined;
      }
      const columnOffset = -'(function (exports, require, module, __filename, __dirname) { '.length;
      code =
        `const { readFileSync, writeFileSync } = require('fs'), { Script } = require('vm'), { wrap } = require('module');\n` +
        `const basename = __dirname + '/${filename}';\n` +
        `const source = readFileSync(basename + '.cache${ext}', 'utf-8');\n` +
        `const cachedData = !process.pkg && require('process').platform !== 'win32' && readFileSync(basename + '.cache');\n` +
        `const scriptOpts = { filename: basename + '.cache${ext}', columnOffset: ${columnOffset} }\n` +
        `const script = new Script(wrap(source), cachedData ? Object.assign({ cachedData }, scriptOpts) : scriptOpts);\n` +
        `(script.runInThisContext())(exports, require, module, __filename, __dirname);\n` +
        `if (cachedData) process.on('exit', () => { try { writeFileSync(basename + '.cache', script.createCachedData()); } catch(e) {} });\n`;
    }

    if (sourceMap && sourceMapRegister) {
      code = `require('./sourcemap-register${ext}');` + code;
      assets[`sourcemap-register${ext}`] = { source: fs.readFileSync(`${__dirname}/sourcemap-register.js.cache.js`), permissions: defaultPermissions };
    }

    if (shebangMatch) {
      code = shebangMatch[0] + code;
      // add a line offset to the sourcemap
      if (map)
        map.mappings = ";" + map.mappings;
    }

    // for each .js / .mjs / .cjs file in the asset list, build that file with ncc itself
    if (!noAssetBuilds) {
      const compilation = compilationStack[compilationStack.length - 1];
      let existingAssetNames = Object.keys(assets);
      existingAssetNames.push(`${filename}${ext === '.cjs' ? '.js' : ''}`);
      const subbuildAssets = [];
      for (const asset of Object.keys(assets)) {
        if (!asset.endsWith('.js') && !asset.endsWith('.cjs') && !asset.endsWith('.ts') && !asset.endsWith('.mjs') ||
            asset.endsWith('.cache.js') || asset.endsWith('.cache.cjs') || asset.endsWith('.cache.ts') || asset.endsWith('.cache.mjs') || asset.endsWith('.d.ts')) {
          existingAssetNames.push(asset);
          continue;
        }
        const assetMeta = relocateLoader.getAssetMeta(asset, compilation);
        if (!assetMeta || !assetMeta.path) {
          existingAssetNames.push(asset);
          continue;
        }
        subbuildAssets.push(asset);
      }
      for (const asset of subbuildAssets) {
        const assetMeta = relocateLoader.getAssetMeta(asset, compilation);
        const path = assetMeta.path;
        const { code, assets: subbuildAssets, symlinks: subbuildSymlinks, stats: subbuildStats } = await ncc(path, {
          cache,
          externals,
          filename: asset,
          minify,
          sourceMap,
          sourceMapRegister,
          sourceMapBasePrefix,
          // dont recursively asset build
          // could be supported with seen tracking
          noAssetBuilds: true,
          v8cache,
          filterAssetBase,
          existingAssetNames,
          quiet,
          debugLog,
          transpileOnly,
          license,
          target
        });
        Object.assign(symlinks, subbuildSymlinks);
        Object.assign(stats, subbuildStats);
        for (const subasset of Object.keys(subbuildAssets)) {
          assets[subasset] = subbuildAssets[subasset];
          if (!existingAssetNames.includes(subasset))
            existingAssetNames.push(subasset);
        }
        assets[asset] = { source: code, permissions: assetMeta.permissions };
      }
    }

    compilationStack.pop();

    return { code, map: map ? JSON.stringify(map) : undefined, assets, symlinks, stats };
  }
}

// this could be rewritten with actual FS apis / globs, but this is simpler
function getFlatFiles(mfsData, output, getAssetMeta, curBase = "") {
  for (const path of Object.keys(mfsData)) {
    const item = mfsData[path];
    const curPath = `${curBase}/${path}`;
    // directory
    if (item[""] === true) getFlatFiles(item, output, getAssetMeta, curPath);
    // file
    else if (!curPath.endsWith("/")) {
      const meta = getAssetMeta(curPath.substr(1)) || {};
      output[curPath.substr(1)] = {
        source: mfsData[path],
        permissions: meta.permissions
      };
    }
  }
}
