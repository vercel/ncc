const path = require('path');
const { readFile, stat, statSync, existsSync } = require('graceful-fs');
const { walk } = require('estree-walker');
const MagicString = require('magic-string');
const { attachScopes } = require('rollup-pluginutils');
const evaluate = require('static-eval');
const acorn = require('acorn');
const bindings = require('bindings');
const getUniqueAssetName = require('../utils/dedupe-names');
const sharedlibEmit = require('../utils/sharedlib-emit');
const glob = require('glob');
const getPackageBase = require('../utils/get-package-base');
const { pregyp, nbind } = require('../utils/binary-locators');
const handleWrappers = require('../utils/wrappers');

const staticPath = Object.assign({ default: path }, path);
const staticFs = { default: { existsSync }, existsSync };

function isExpressionReference(node, parent) {
	if (parent.type === 'MemberExpression') return parent.computed || node === parent.object;

	// disregard the `bar` in { bar: foo }
	if (parent.type === 'Property' && node !== parent.value) return false;

	// disregard the `bar` in `class Foo { bar () {...} }`
	if (parent.type === 'MethodDefinition') return false;

	// disregard the `bar` in `export { foo as bar }`
  if (parent.type === 'ExportSpecifier' && node !== parent.local) return false;

  // disregard the `bar` in var bar = asdf
  if (parent.type === 'VariableDeclarator' && node.id === node) return false;

	return true;
}

const relocateRegEx = /_\_dirname|_\_filename|require\.main|node-pre-gyp|bindings|define|require\(\s*[^'"]/;

module.exports = function (code) {
  if (this.cacheable)
    this.cacheable();
  this.async();
  const id = this.resourcePath;

  if (id.endsWith('.json') || !code.match(relocateRegEx))
    return this.callback(null, code);

  // calculate the base-level package folder to load bindings from
  const pkgBase = getPackageBase(id);

  const staticModules = Object.assign(Object.create(null), {
    path: staticPath,
    fs: staticFs,
    'node-pre-gyp': pregyp,
    'node-pre-gyp/lib/pre-binding': pregyp,
    'node-pre-gyp/lib/pre-binding.js': pregyp,
    'nbind': nbind
  });

  let staticBindingsInstance = false;
  function createBindings () {
    return (opts = {}) => {
      if (typeof opts === 'string')
        opts = { bindings: opts };
      if (!opts.path) {
        opts.path = true;
        staticBindingsInstance = true;
      }
      opts.module_root = pkgBase;
      return bindings(opts);
    };
  }

  const emitAsset = (assetPath) => {
    // JS assets to support require(assetPath) and not fs-based handling
    // NB package.json is ambiguous here...
    let outName = path.basename(assetPath);

    if (assetPath.endsWith('.node')) {
      // retain directory depth structure for binaries for rpath to work out
      if (pkgBase)
        outName = assetPath.substr(pkgBase.length);
      // If the asset is a ".node" binary, then glob for possible shared
      // libraries that should also be included
      assetEmissionPromises = assetEmissionPromises.then(sharedlibEmit(pkgBase, assetState, this.emitFile));
    }

    const name = assetState.assets[assetPath] ||
        (assetState.assets[assetPath] = getUniqueAssetName(outName, assetPath, assetState.assetNames));

    // console.log('Emitting ' + assetPath + ' for module ' + id);
    assetEmissionPromises = assetEmissionPromises.then(async () => {
      const [source, permissions] = await Promise.all([
        new Promise((resolve, reject) =>
          readFile(assetPath, (err, source) => err ? reject(err) : resolve(source))
        ),
        await new Promise((resolve, reject) => 
          stat(assetPath, (err, stats) => err ? reject(err) : resolve(stats.mode))
        )
      ]);
      assetState.assetPermissions[name] = permissions;
      this.emitFile(name, source);
    });
    return "__dirname + '/" + JSON.stringify(name).slice(1, -1) + "'";
  };
  const emitAssetDirectory = (assetDirPath) => {
    const dirName = path.basename(assetDirPath);
    const name = assetState.assets[assetDirPath] || (assetState.assets[assetDirPath] = getUniqueAssetName(dirName, assetDirPath, assetState.assetNames));
    assetState.assets[assetDirPath] = name;

    assetEmissionPromises = assetEmissionPromises.then(async () => {
      const files = await new Promise((resolve, reject) =>
        glob(assetDirPath + '/**/*', { mark: true, ignore: 'node_modules/**/*' }, (err, files) => err ? reject(err) : resolve(files))
      );
      await Promise.all(files.map(async file => {
        // dont emit empty directories or ".js" files
        if (file.endsWith('/') || file.endsWith('.js'))
          return;
        const [source, permissions] = await Promise.all([
          new Promise((resolve, reject) =>
            readFile(file, (err, source) => err ? reject(err) : resolve(source))
          ),
          await new Promise((resolve, reject) => 
            stat(file, (err, stats) => err ? reject(err) : resolve(stats.mode))
          )
        ]);
        assetState.assetPermissions[name + file.substr(assetDirPath.length)] = permissions;
        this.emitFile(name + file.substr(assetDirPath.length), source);
      }));
    });

    return "__dirname + '/" + JSON.stringify(name).slice(1, -1) + "'";
  };

  let assetEmissionPromises = Promise.resolve();

  const magicString = new MagicString(code);

  let ast, isESM;
  try {
    ast = acorn.parse(code, { allowReturnOutsideFunction: true });
    isESM = false;
  }
  catch (e) {}
  if (!ast) {
    ast = acorn.parse(code, { sourceType: 'module' });
    isESM = true;
  }

  let scope = attachScopes(ast, 'scope');

  const knownBindings = Object.assign(Object.create(null), {
    __dirname: {
      shadowDepth: 0,
      value: path.resolve(id, '..')
    },
    __filename: {
      shadowDepth: 0,
      value: id
    }
  });

  if (!isESM)
    knownBindings.require = {
      shadowDepth: 0
    };

  function setKnownBinding (name, value) {
    // require is somewhat special in that we shadow it but don't
    // statically analyze it ("known unknown" of sorts)
    if (name === 'require') return;
    knownBindings[name] = {
      shadowDepth: 0,
      value: value
    };
  }
  function getKnownBinding (name) {
    const binding = knownBindings[name];
    if (binding) {
      if (binding.shadowDepth === 0) {
        return binding.value;
      }
    }
  }

  let nbindId, pregypId, bindingsId;

  if (isESM) {
    for (const decl of ast.body) {
      if (decl.type === 'ImportDeclaration') {
        const source = decl.source.value;
        const staticModule = staticModules[source];
        if (staticModule) {
          for (const impt of decl.specifiers) {
            let bindingId;
            if (impt.type === 'ImportNamespaceSpecifier')
              setKnownBinding(bindingId = impt.local.name, staticModule);
            else if (impt.type === 'ImportDefaultSpecifier' && 'default' in staticModule)
              setKnownBinding(bindingId = impt.local.name, staticModule.default);
            else if (impt.type === 'ImportSpecifier' && impt.imported.name in staticModule)
              setKnownBinding(bindingId = impt.local.name, staticModule[impt.imported.name]);

            if (source === 'bindings')
              bindingsId = bindingId;
            else if (source === 'node-pre-gyp' || source === 'node-pre-gyp/lib/pre-binding' || source === 'node-pre-gyp/lib/pre-binding.js')
              pregypId = bindingId;
            else if (source === 'nbind')
              nbindId = bindingId;
          }
        }
      }
    }
  }

  let transformed = false;

  function computeStaticValue (expr) {
    staticBindingsInstance = false;
    // function expression analysis disabled due to static-eval locals bug
    if (expr.type === 'FunctionExpression')
      return;

    const vars = Object.create(null);
    Object.keys(knownBindings).forEach(name => {
      const { shadowDepth, value } = knownBindings[name];
      if (shadowDepth === 0 && value !== undefined)
        vars[name] = value;
    });

    // evaluate returns undefined for non-statically-analyzable
    return evaluate(expr, vars);
  }

  // statically determinable leaves are tracked, and inlined when the
  // greatest parent statically known leaf computation corresponds to an asset path
  let staticChildNode, staticChildValue, staticChildValueBindingsInstance;

  // detect require('asdf');
  function isStaticRequire (node) {
    return node &&
        node.type === 'CallExpression' &&
        node.callee.type === 'Identifier' &&
        node.callee.name === 'require' &&
        knownBindings.require.shadowDepth === 0 &&
        node.arguments.length === 1 &&
        node.arguments[0].type === 'Literal';
  }

  // detect require(...)
  function isRequire (node) {
    return node &&
        node.type === 'CallExpression' &&
        (node.callee.type === 'Identifier' &&
          node.callee.name === 'require' &&
          knownBindings.require.shadowDepth === 0 ||
          node.callee.type === 'MemberExpression' &&
          node.callee.object.type === 'Identifier' &&
          node.callee.object.name === 'require');
  }

  function isAnalyzableRequire (expression) {
    if (expression.type === 'Identifier' || expression.type === 'MemberExpression')
      return false;
    // "possibly" analyzable (this can be further restricted over time)
    return true;
  }

  ({ ast, scope, transformed } = handleWrappers(ast, scope, magicString, code.length));

  walk(ast, {
    enter (node, parent) {
      if (node.scope) {
        scope = node.scope;
        for (const id in node.scope.declarations) {
          if (id in knownBindings)
            knownBindings[id].shadowDepth++;
        }
      }

      if (staticChildNode)
        return this.skip();

      // detect asset leaf expression triggers (if not already)
      // __dirname,  __filename, binary only currently as well as require('bindings')(...)
      // Can add require.resolve, import.meta.url, even path-like environment variables
      if (node.type === 'Identifier' && isExpressionReference(node, parent)) {
        if (node.name === '__dirname' || node.name === '__filename' ||
            node.name === pregypId || node.name === bindingsId) {
          const binding = getKnownBinding(node.name);
          if (binding) {
            staticChildValue = computeStaticValue(node, false);
            // if it computes, then we start backtracking
            if (staticChildValue) {
              staticChildNode = node;
              staticChildValueBindingsInstance = staticBindingsInstance;
              return this.skip();
            }
          }
        }
      }
      // require('bindings')('asdf')
      else if (node.type === 'CallExpression' && !isESM &&
          isStaticRequire(node.callee) &&
          node.callee.arguments[0].value === 'bindings') {
        staticChildValue = createBindings()(computeStaticValue(node.arguments[0], true));
        if (staticChildValue) {
          staticChildNode = node;
          staticChildValueBindingsInstance = staticBindingsInstance;
          return this.skip();
        }
      }
      // require(dynamic) -> __non_webpack_require__(dynamic)
      else if (isRequire(node) && !isAnalyzableRequire(node.arguments[0])) {
        transformed = true;
        magicString.overwrite(node.callee.start, node.callee.end, "__non_webpack_require__");
        return this.skip();
      }
      // nbind.init(...) -> require('./resolved.node')
      else if (nbindId && node.type === 'CallExpression' &&
          node.callee.type === 'MemberExpression' &&
          node.callee.object.type === 'Identifier' &&
          node.callee.object.name === nbindId &&
          node.callee.property.type === 'Identifier' &&
          node.callee.property.name === 'init') {
        const bindingInfo = computeStaticValue(node, false);
        if (bindingInfo) {
          bindingInfo.path = path.relative(path.dirname(id), bindingInfo.path);
          transformed = true;
          magicString.overwrite(node.start, node.end, `({ bind: require("${bindingInfo.path}").NBind.bind_value, lib: require("${bindingInfo.path}") })`);
          return this.skip();
        }
      }

      // require.main -> __non_webpack_require__.main
      // (unless it is a require.main === module check)
      else if (!isESM && node.type === 'MemberExpression' &&
               node.object.type === 'Identifier' &&
               node.object.name === 'require' &&
               knownBindings.require.shadowDepth === 0 &&
               node.property.type === 'Identifier' &&
               node.property.name === 'main' &&
               !node.computed) {
        if (parent && parent.type === 'BinaryExpression' && (parent.operator === '==' || parent.operator === '===')) {
          let other;
          other = parent.right === node ? parent.left : parent.right;
          if (other.type === 'Identifier' && other.name === 'module')
            return;
        }
        magicString.overwrite(node.object.start, node.object.end, '__non_webpack_require__');
        transformed = true;
      }
      else if (!isESM && node.type === 'Property' && node.value.type === 'Identifier' &&
               node.value.name === 'require' && knownBindings.require.shadowDepth === 0) {
        magicString.overwrite(node.value.start, node.value.end, '__non_webpack_require__');
        transformed = true;
      }
      else if (node.type === 'VariableDeclaration') {
        for (const decl of node.declarations) {
          let binding;
          if (!isESM && isStaticRequire(decl.init)) {
            const source = decl.init.arguments[0].value;
            const staticModule = staticModules[source];
            if (staticModule) {
              // var known = require('known');
              if (decl.id.type === 'Identifier') {
                setKnownBinding(decl.id.name, staticModule.default);
                if (source === 'bindings')
                  bindingsId = decl.id.name;
                else if (source === 'node-pre-gyp' || source === 'node-pre-gyp/lib/pre-binding' || source === 'node-pre-gyp/lib/pre-binding.js')
                  pregypId = decl.id.name;
                else if (source === 'nbind')
                  nbindId = decl.id.name;
              }
              // var { known } = require('known);
              else if (decl.id.type === 'ObjectPattern') {
                for (const prop of decl.id.properties) {
                  if (prop.type !== 'Property' ||
                      prop.key.type !== 'Identifier' ||
                      prop.value.type !== 'Identifier' ||
                      !(prop.key.name in staticModule))
                    continue;
                  setKnownBinding(prop.value.name, staticModule[prop.key.name]);
                }
              }
            }
          }
          // var { knownProp } = known;
          else if (decl.id.type === 'ObjectPattern' &&
                   decl.init && decl.init.type === 'Identifier' &&
                   (binding = getKnownBinding(decl.init.name)) !== undefined &&
                   prop.key.name in binding) {
            setKnownBinding(prop.value.name, binding[prop.key.name]);
          }
          // var known = known.knownProp;
          else if (decl.id.type === 'Identifier' &&
                   decl.init &&
                   decl.init.type === 'MemberExpression' &&
                   decl.init.computed === false &&
                   decl.init.object.type === 'Identifier' &&
                   decl.init.property.type === 'Identifier' &&
                   (binding = getKnownBinding(decl.init.object.name)) !== undefined &&
                   decl.init.property.name in binding) {
            setKnownBinding(decl.id.name, binding[decl.init.property.name]);
          }
        }
      }
      else if (node.type === 'AssignmentExpression') {
        // path = require('path')
        if (isStaticRequire(node.right) && node.right.arguments[0].value in staticModules &&
            node.left.type === 'Identifier' && scope.declarations[node.left.name]) {
          setKnownBinding(node.left.name, staticModules[node.right.arguments[0].value]);
        }
      }
    },
    leave (node, parent) {
      if (node.scope) {
        scope = scope.parent;
        for (const id in node.scope.declarations) {
          if (id in knownBindings) {
            if (knownBindings[id].shadowDepth > 0)
              knownBindings[id].shadowDepth--;
            else
              delete knownBindings[id];
          }
        }
      }

      // computing a static expression outward
      // -> compute and backtrack
      if (staticChildNode) {
        const curStaticValue = computeStaticValue(node, false);
        if (curStaticValue !== undefined) {
          staticChildValue = curStaticValue;
          staticChildNode = node;
          staticChildValueBindingsInstance = staticBindingsInstance;
          return;
        }
        // Filter out emitting assets for a __filename call on its own
        if (staticChildNode.type === 'Identifier' && staticChildNode.name === '__filename' ||
            staticChildNode.type === 'ReturnStatement' && staticChildNode.argument.type === 'Identifier' &&
            staticChildNode.argument.name === '__filename') {
          staticChildNode = staticChilValue = undefined;
          return;
        }
        // no static value -> see if we should emit the asset if it exists
        // Currently we only handle files. In theory whole directories could also be emitted if necessary.
        let stats;
        if (typeof staticChildValue === 'string') {
          try {
            stats = statSync(staticChildValue);
          }
          catch (e) {}
        }
        // Boolean inlining
        else if (typeof staticChildValue === 'boolean') {
          transformed = true;
          magicString.overwrite(staticChildNode.start, staticChildNode.end, String(staticChildValue));
        }
        if (stats && stats.isFile()) {
          let replacement = emitAsset(path.resolve(staticChildValue));
          // require('bindings')(...)
          // -> require(require('bindings')(...))
          if (staticChildValueBindingsInstance) {
            replacement = '__non_webpack_require__(' + replacement + ')';
          }
          if (replacement) {
            transformed = true;
            magicString.overwrite(staticChildNode.start, staticChildNode.end, replacement);
          }
        }
        else if (stats && stats.isDirectory()) {
          let replacement = emitAssetDirectory(path.resolve(staticChildValue));
          if (replacement) {
            transformed = true;
            magicString.overwrite(staticChildNode.start, staticChildNode.end, replacement);
          }
        }
        staticChildNode = staticChildValue = undefined;
      }
    }
  });

  if (!transformed)
    return this.callback(null, code);

  assetEmissionPromises.then(() => {
    code = magicString.toString();
    const map = magicString.generateMap();
  
    this.callback(null, code, map);
  });
};

let assetState;
module.exports.setAssetState = function (state) {
  assetState = state;
};