const resolve = require("resolve");
const fs = require("graceful-fs");
const crypto = require("crypto");
const { join, dirname, extname, relative, resolve: pathResolve } = require("path");
const webpack = require("webpack");
const MemoryFS = require("memory-fs");
const terser = require("terser");
const shebangRegEx = require('./utils/shebang');
const nccCacheDir = require("./utils/ncc-cache-dir");
const JSON5 = require("json5");
const { LicenseWebpackPlugin } = require('license-webpack-plugin');
const { version: nccVersion } = require('../package.json');
const { hasTypeModule } = require('./utils/has-type-module');

// support glob graceful-fs
fs.gracefulify(require("fs"));

const SUPPORTED_EXTENSIONS = [".js", ".json", ".node", ".mjs", ".ts", ".tsx"];

const hashOf = name => {
  return crypto
    .createHash("sha256")
    .update(name)
    .digest("hex")
    .slice(0, 10);
}

const defaultPermissions = 0o666;

const relocateLoader = eval('require(__dirname + "/loaders/relocate-loader.js")');

module.exports = ncc;
function ncc(
  entry,
  {
    cache,
    customEmit = undefined,
    esm = entry.endsWith('.mjs') || !entry.endsWith('.cjs') && hasTypeModule(entry),
    externals = [],
    filename = 'index' + (!esm && entry.endsWith('.cjs') ? '.cjs' : esm && (entry.endsWith('.mjs') || !hasTypeModule(entry)) ? '.mjs' : '.js'),
    minify = false,
    sourceMap = false,
    sourceMapRegister = true,
    sourceMapBasePrefix = '../',
    assetBuilds = false,
    watch = false,
    v8cache = false,
    filterAssetBase = process.cwd(),
    existingAssetNames = [],
    quiet = false,
    debugLog = false,
    transpileOnly = false,
    license = '',
    target,
    production = true,
    // webpack defaults to `module` and `main`, but that's
    // not really what node.js supports, so we reset it
    mainFields = ['main'],
  } = {}
) {
  // v8 cache not supported for ES modules
  if (esm)
    v8cache = false;

  const cjsDeps = () => ({
    mainFields,
    extensions: SUPPORTED_EXTENSIONS,
    exportsFields: ["exports"],
    importsFields: ["imports"],
    conditionNames: ["require", "node", production ? "production" : "development"]
  });
  const esmDeps = () => ({
    mainFields,
    extensions: SUPPORTED_EXTENSIONS,
    exportsFields: ["exports"],
    importsFields: ["imports"],
    conditionNames: ["import", "node", production ? "production" : "development"]
  });

  const ext = extname(filename);

  if (!quiet) {
    console.log(`ncc: Version ${nccVersion}`);
    console.log(`ncc: Compiling file ${filename} into ${esm ? 'ESM' : 'CJS'}`);
  }

  if (target && !target.startsWith('es')) {
    throw new Error(`Invalid "target" value provided ${target}, value must be es version e.g. es2015`)
  }

  const resolvedEntry = resolve.sync(entry);
  process.env.__NCC_OPTS = JSON.stringify({
    quiet,
    typescriptLookupPath: resolvedEntry,
  });

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

  let tsconfig = {};
  const resolvePlugins = [];
  const resolveModules = [];
  try {
    const configPath = walkParentDirs({
      base: process.cwd(),
      start: dirname(entry),
      filename: 'tsconfig.json',
    });
    const contents = fs.readFileSync(configPath, 'utf8')
    tsconfig = JSON5.parse(contents);
    const baseUrl = tsconfig.compilerOptions.baseUrl;
    resolveModules.push(pathResolve(dirname(configPath), baseUrl));
  } catch (e) { }

  const compilerOptions = tsconfig.compilerOptions || {};

  resolvePlugins.push({
    apply(resolver) {
      const resolve = resolver.resolve;
      resolver.resolve = function(context, path, request, resolveContext, callback) {
        const self = this;
        resolve.call(self, context, path, request, resolveContext, function(err, innerPath, result) {
          if (result) return callback(null, innerPath, result);
          if (err && !err.message.startsWith('Can\'t resolve'))
            return callback(err);
          // Allow .js resolutions to .tsx? from .tsx?
          if (request.endsWith('.js') && context.issuer && (context.issuer.endsWith('.ts') || context.issuer.endsWith('.tsx'))) {
            return resolve.call(self, context, path, request.slice(0, -3), resolveContext, function(err, innerPath, result) {
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

  const externalMap = (() => {
    const regexps = [];
    const aliasMap = new Map();
    const regexCache = new Map();

    function set(key, value) {
      if (key instanceof RegExp)
        regexps.push(key);
      aliasMap.set(key, value);
    }

    function get(key) {
      if (aliasMap.has(key)) return aliasMap.get(key);
      if (regexCache.has(key)) return regexCache.get(key);

      for (const regex of regexps) {
        const matches = key.match(regex)

        if (matches) {
          let result = aliasMap.get(regex)

          if (matches.length > 1) {
            // allow using match from regex in result
            // e.g. caniuse-lite(/.*) -> caniuse-lite$1
            result = result.replace(/(\$\d)/g, (match) => {
              const index = parseInt(match.slice(1), 10)
              return matches[index] || match
            })
          }
          regexCache.set(key, result)
          return result
        }
      }
      return null;
    }

    return { get, set };
  })();

  if (Array.isArray(externals))
    externals.forEach(external => externalMap.set(external, external));
  else if (typeof externals === 'object')
    Object.keys(externals).forEach(external => externalMap.set(external[0] === '/' && external[external.length - 1] === '/' ? new RegExp(external.slice(1, -1)) : external, externals[external]));

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
                tapInfo.fn = () => { };
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

  if (typeof license === 'string' && license.length > 0) {
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
    snapshot: {
      managedPaths: [],
      module: { hash: true }
    },
    amd: false,
    experiments: {
      topLevelAwait: true,
      outputModule: esm
    },
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
    target: target ? ["node14", target] : "node14",
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
      libraryTarget: esm ? 'module' : 'commonjs2',
      strictModuleExceptionHandling: true,
      module: esm
    },
    resolve: {
      extensions: SUPPORTED_EXTENSIONS,
      exportsFields: ["exports"],
      importsFields: ["imports"],
      byDependency: {
        wasm: esmDeps(),
        esm: esmDeps(),
        url: { preferRelative: true },
        worker: { ...esmDeps(), preferRelative: true },
        commonjs: cjsDeps(),
        amd: cjsDeps(),
        // for backward-compat: loadModule
        loader: cjsDeps(),
        // for backward-compat: Custom Dependency
        unknown: cjsDeps(),
        // for backward-compat: getResolve without dependencyType
        undefined: cjsDeps()
      },
      mainFields,
      plugins: resolvePlugins,
      modules: resolveModules.length > 0 ? resolveModules : undefined,
    },
    // https://github.com/vercel/ncc/pull/29#pullrequestreview-177152175
    node: false,
    externals({ context, request, dependencyType }, callback) {
      const external = externalMap.get(request);
      if (external) return callback(null, `${dependencyType === 'esm' && esm ? 'module' : 'node-commonjs'} ${external}`);
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
              customEmit,
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
            loader: eval('__dirname + "/loaders/swc-loader.js"'),
            options: {
              minify: false,
              exclude: tsconfig.exclude,
              sourceMaps: compilerOptions.sourceMap || false,
              module: {
                type: compilerOptions.module && compilerOptions.module.toLowerCase() === 'commonjs' ? 'commonjs' : 'es6',
                strict: false,
                strictMode: true,
                lazy: false,
                noInterop: !compilerOptions.esModuleInterop
              },
              jsc: {
                externalHelpers: false,
                keepClassNames: true,
                target: compilerOptions.target && compilerOptions.target.toLowerCase() || 'es2021',
                paths: compilerOptions.paths,
                baseUrl: compilerOptions.baseUrl,
                parser: {
                  syntax: 'typescript',
                  tsx: true, // TODO: use tsconfig.compilerOptions.jsx ???
                  decorators: compilerOptions.experimentalDecorators || false,
                  dynamicImport: true, // TODO: use module ???
                }
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
            const errLog = [...stats.compilation.errors].map(err => err.message).join('\n');
            return reject(new Error(errLog));
          }
          resolve(stats);
        });
      });
    })
      .then(finalizeHandler, function(err) {
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
      close() {
        if (!watcher)
          throw new Error('No watcher to close.');
        if (closed)
          throw new Error('Watcher already closed.');
        closed = true;
        watcher.close();
      },
      handler(handler) {
        if (watchHandler)
          throw new Error('Watcher handler already provided.');
        watchHandler = handler;
        if (cachedResult) {
          handler(cachedResult);
          cachedResult = null;
        }
      },
      rebuild(handler) {
        if (rebuildHandler)
          throw new Error('Rebuild handler already provided.');
        rebuildHandler = handler;
      }
    };
  }

  async function finalizeHandler(stats) {
    const assets = Object.create(null);
    getFlatFiles(mfs.data, assets, relocateLoader.getAssetMeta, compilerOptions);
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
      let result;
      try {
        result = await terser.minify(code, {
          module: esm,
          compress: false,
          mangle: {
            keep_classnames: true,
            keep_fnames: true
          },
          sourceMap: map ? {
            content: map,
            filename,
            url: `${filename}.map`
          } : false
        });
        // For some reason, auth0 returns "undefined"!
        // custom terser phase used over Webpack integration for this reason
        if (!result || result.code === undefined)
          throw null;

        ({ code, map } = {
          code: result.code,
          map: map ? JSON.parse(result.map) : undefined
        });
      }
      catch (e) {
        console.log('An error occurred while minifying. The result will not be minified.');
      }
    }

    if (map) {
      assets[`${filename}.map`] = { source: JSON.stringify(map), permissions: defaultPermissions };
    }

    if (v8cache) {
      const { Script } = require('vm');
      assets[`${filename}.cache`] = { source: new Script(code).createCachedData(), permissions: defaultPermissions };
      assets[`${filename}.cache${ext}`] = { source: code, permissions: defaultPermissions };
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

    if (map && sourceMapRegister) {
      const registerExt = esm ? '.cjs' : ext;
      code = (esm ? `import './sourcemap-register${registerExt}';` : `require('./sourcemap-register${registerExt}');`) + code;
      assets[`sourcemap-register${registerExt}`] = { source: fs.readFileSync(join(__dirname, `sourcemap-register.js.cache.js`)), permissions: defaultPermissions };
    }

    if (esm && !filename.endsWith('.mjs')) {
      // always output a "type": "module" package JSON for esm builds
      const baseDir = dirname(filename);
      const pjsonPath = (baseDir === '.' ? '' : baseDir) + 'package.json';
      if (assets[pjsonPath])
        assets[pjsonPath].source = JSON.stringify(Object.assign(JSON.parse(assets[pjsonPath].source.toString()), { type: 'module' }));
      else
        assets[pjsonPath] = { source: JSON.stringify({ type: 'module' }, null, 2) + '\n', permissions: defaultPermissions };
    }

    if (shebangMatch) {
      code = shebangMatch[0] + code;
      // add a line offset to the sourcemap
      if (map)
        map.mappings = ";" + map.mappings;
    }

    // __webpack_require__ can conflict with webpack injections in module scopes
    // to avoid this without recomputing the source map we replace it with an
    // identical length identifier
    if (code.indexOf('"__webpack_require__"') === -1) {
      // dedupe any existing __nccwpck_require__ first
      if (code.indexOf('__nccwpck_require2_') !== -1) {
        // nth level nesting (we support 9 levels apparently)
        for (let i = 9; i > 1; i--) {
          if (code.indexOf(`__nccwpck_require${i}_`) === -1)
            continue;
          if (i === 9)
            throw new Error('9 levels of ncc build nesting reached, please post an issue to support this level of ncc build composition.');
          code = code.replace(new RegExp(`__nccwpck_require${i}_`, 'g'), `__nccwpck_require${i + 1}_`);
        }
      }
      if (code.indexOf('__nccwpck_require__') !== -1)
        code = code.replace(/__nccwpck_require__/g, '__nccwpck_require2_');
      code = code.replace(/__webpack_require__/g, '__nccwpck_require__');
    }

    // for each .js / .mjs / .cjs file in the asset list, build that file with ncc itself
    if (assetBuilds) {
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
          assetBuilds: false,
          v8cache,
          filterAssetBase,
          existingAssetNames,
          quiet,
          debugLog,
          // don't re-run type checking on a sub-build, as it is a waste of CPU
          transpileOnly: true,
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
function getFlatFiles(mfsData, output, getAssetMeta, compilerOptions, curBase = "") {
  for (const path of Object.keys(mfsData)) {
    const item = mfsData[path];
    let curPath = `${curBase}/${path}`;
    // directory
    if (item[""] === true) getFlatFiles(item, output, getAssetMeta, compilerOptions, curPath);
    // file
    else if (!curPath.endsWith("/")) {
      const meta = getAssetMeta(curPath.slice(1)) || {};
      if (curPath.endsWith(".d.ts")) {
        const outDir = compilerOptions?.outDir ? pathResolve(compilerOptions.outDir) : pathResolve('dist');
        curPath = curPath
          .replace(outDir, "")
          .replace(process.cwd(), "")
      }
      output[curPath.slice(1)] = {
        source: mfsData[path],
        permissions: meta.permissions
      };
    }
  }
}

// Adapted from https://github.com/vercel/vercel/blob/18bec983aefbe2a77bd14eda6fca59ff7e956d8b/packages/build-utils/src/fs/run-user-scripts.ts#L289-L310
function walkParentDirs({
  base,
  start,
  filename,
}) {
  let parent = '';

  for (let current = start; base.length <= current.length; current = parent) {
    const fullPath = join(current, filename);

    // eslint-disable-next-line no-await-in-loop
    if (fs.existsSync(fullPath)) {
      return fullPath;
    }

    parent = dirname(current);
  }

  return null;
}
