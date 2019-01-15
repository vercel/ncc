const path = require('path');
const fs = require('graceful-fs');
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
const { getOptions } = require('loader-utils');

// binary support for inlining logic from - node-pre-gyp/lib/pre-binding.js
function isPregypId (id) {
  return id === 'node-pre-gyp' ||
      id === 'node-pre-gyp/lib/pre-binding' ||
      id === 'node-pre-gyp/lib/pre-binding.js';
}
const versioning = require('node-pre-gyp/lib/util/versioning.js');
const napi = require('node-pre-gyp/lib/util/napi.js');
const pregyp = {
  find (package_json_path, opts) {
    const package_json = JSON.parse(fs.readFileSync(package_json_path).toString());
    versioning.validate_config(package_json, opts);
    var napi_build_version;
    if (napi.get_napi_build_versions (package_json, opts)) {
      napi_build_version = napi.get_best_napi_build_version(package_json, opts);
    }
    opts = opts || {};
    if (!opts.module_root) opts.module_root = path.dirname(package_json_path);
    var meta = versioning.evaluate(package_json,opts,napi_build_version);
    return meta.module;
  }
};

function getNbind () {
  // Adapted from nbind.js
  function makeModulePathList(root, name) {
    return ([
      [root, name],
      [root, 'build', name],
      [root, 'build', 'Debug', name],
      [root, 'build', 'Release', name],
      [root, 'out', 'Debug', name],
      [root, 'Debug', name],
      [root, 'out', 'Release', name],
      [root, 'Release', name],
      [root, 'build', 'default', name],
      [
          root,
          process.env['NODE_BINDINGS_COMPILED_DIR'] || 'compiled',
          process.versions.node,
          process.platform,
          process.arch,
          name
      ]
    ]);
  }
  function findCompiledModule(basePath, specList) {
    var resolvedList = [];
    var ext = path.extname(basePath);
    for (var _i = 0, specList_1 = specList; _i < specList_1.length; _i++) {
      var spec = specList_1[_i];
      if (ext == spec.ext) {
        try {
          spec.path = eval('require.resolve(basePath)');
          return spec;
        }
        catch (err) {
          resolvedList.push(basePath);
        }
      }
    }
    for (var _a = 0, specList_2 = specList; _a < specList_2.length; _a++) {
      var spec = specList_2[_a];
      for (var _b = 0, _c = makeModulePathList(basePath, spec.name); _b < _c.length; _b++) {
        var pathParts = _c[_b];
        var resolvedPath = path.resolve.apply(path, pathParts);
        try {
          spec.path = eval('require.resolve(resolvedPath)');
        }
        catch (err) {
          resolvedList.push(resolvedPath);
          continue;
        }
        return spec;
      }
    }
    return null;
  }
  function find(basePath = process.cwd()) {
    return findCompiledModule(basePath, [
      { ext: '.node', name: 'nbind.node', type: 'node' },
      { ext: '.js', name: 'nbind.js', type: 'emcc' }
    ]);
  }
  return { init: find, find: find };
}

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

  // disregard the `x` in import/export 'x';
  if (parent.type === 'ImportDeclaration' || parent.type === 'ExportNamedDeclaration' || parent.type === 'ExportAllDeclaration') return false;

	return true;
}

// Wrapper detections for require extraction handles:
// 
// When.js-style AMD wrapper:
//   (function (define) { 'use strict' define(function (require) { ... }) })
//   (typeof define === 'function' && define.amd ? define : function (factory) { module.exports = factory(require); })
// ->
//   (function (define) { 'use strict' define(function () { ... }) })
//   (typeof define === 'function' && define.amd ? define : function (factory) { module.exports = factory(require); })
//
// Browserify-style wrapper
//   (function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.bugsnag = f()}})(function(){var define,module,exports;return (function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({
//   1:[function(require,module,exports){
//     ...code...
//   },{"external":undefined}], 2: ...
//   },{},[24])(24)
//   });
// ->
//   (function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.bugsnag = f()}})(function(){var define,module,exports;return (function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({
//   1:[function(require,module,exports){
//     ...code...
//   },{"external":undefined}], 2: ...
//   },{
//     "external": { exports: require('external') }
//   },[24])(24)
//   });
//

function handleWrappers (ast, scope, magicString, len) {
  let transformed = false;
  if (ast.body.length === 1 &&
      ast.body[0].type === 'ExpressionStatement' &&
      ast.body[0].expression.type === 'CallExpression' &&
      ast.body[0].expression.callee.type === 'FunctionExpression' &&
      ast.body[0].expression.arguments.length === 1) {

    // When.js wrapper
    const arg = ast.body[0].expression.arguments[0];
    if (arg.type === 'ConditionalExpression' && 
        arg.test.type === 'LogicalExpression' &&
        arg.test.operator === '&&' &&
        arg.test.left.type === 'BinaryExpression' &&
        arg.test.left.operator === '===' &&
        arg.test.left.left.type === 'UnaryExpression' &&
        arg.test.left.left.operator === 'typeof' &&
        arg.test.left.left.argument.name === 'define' &&
        arg.test.left.right.type === 'Literal' &&
        arg.test.left.right.value === 'function' &&
        arg.test.right.type === 'MemberExpression' &&
        arg.test.right.object.type === 'Identifier' &&
        arg.test.right.property.type === 'Identifier' &&
        arg.test.right.property.name === 'amd' &&
        arg.test.right.computed === false &&
        arg.alternate.type === 'FunctionExpression' &&
        arg.alternate.params.length === 1 &&
        arg.alternate.params[0].type === 'Identifier' &&
        arg.alternate.body.body.length === 1 &&
        arg.alternate.body.body[0].type === 'ExpressionStatement' &&
        arg.alternate.body.body[0].expression.type === 'AssignmentExpression' &&
        arg.alternate.body.body[0].expression.left.type === 'MemberExpression' &&
        arg.alternate.body.body[0].expression.left.object.type === 'Identifier' &&
        arg.alternate.body.body[0].expression.left.object.name === 'module' &&
        arg.alternate.body.body[0].expression.left.property.type === 'Identifier' &&
        arg.alternate.body.body[0].expression.left.property.name === 'exports' &&
        arg.alternate.body.body[0].expression.left.computed === false &&
        arg.alternate.body.body[0].expression.right.type === 'CallExpression' &&
        arg.alternate.body.body[0].expression.right.callee.type === 'Identifier' &&
        arg.alternate.body.body[0].expression.right.callee.name === arg.alternate.params[0].name &&
        arg.alternate.body.body[0].expression.right.arguments.length === 1 &&
        arg.alternate.body.body[0].expression.right.arguments[0].type === 'Identifier' &&
        arg.alternate.body.body[0].expression.right.arguments[0].name === 'require') {
      let iifeBody = ast.body[0].expression.callee.body.body;
      if (iifeBody[0].type === 'ExpressionStatement' &&
          iifeBody[0].expression.type === 'Literal' &&
          iifeBody[0].expression.value === 'use strict') {
        iifeBody = iifeBody.slice(1);
      }

      if (iifeBody.length === 1 &&
          iifeBody[0].type === 'ExpressionStatement' &&
          iifeBody[0].expression.type === 'CallExpression' &&
          iifeBody[0].expression.callee.type === 'Identifier' &&
          iifeBody[0].expression.callee.name === arg.test.right.object.name &&
          iifeBody[0].expression.arguments.length === 1 &&
          iifeBody[0].expression.arguments[0].type === 'FunctionExpression' &&
          iifeBody[0].expression.arguments[0].params.length === 1 &&
          iifeBody[0].expression.arguments[0].params[0].type === 'Identifier' &&
          iifeBody[0].expression.arguments[0].params[0].name === 'require') {
        magicString.remove(iifeBody[0].expression.arguments[0].params[0].start, iifeBody[0].expression.arguments[0].params[0].end);
        transformed = true;
      }
    }
    // browserify wrapper
    else if (arg.type === 'FunctionExpression' &&
        arg.params.length === 0 &&
        arg.body.body.length === 2 &&
        arg.body.body[0].type === 'VariableDeclaration' &&
        arg.body.body[0].declarations.length === 3 &&
        arg.body.body[0].declarations.every(decl => decl.init === null && decl.id.type === 'Identifier') &&
        arg.body.body[1].type === 'ReturnStatement' &&
        arg.body.body[1].argument.type === 'CallExpression' &&
        arg.body.body[1].argument.callee.type === 'CallExpression' &&
        arg.body.body[1].argument.arguments.length &&
        arg.body.body[1].argument.arguments.every(arg => arg.type === 'Literal' && typeof arg.value === 'number') &&
        arg.body.body[1].argument.callee.callee.type === 'CallExpression' &&
        arg.body.body[1].argument.callee.callee.callee.type === 'FunctionExpression' &&
        arg.body.body[1].argument.callee.callee.arguments.length === 0 &&
        // (dont go deeper into browserify loader internals than this)
        arg.body.body[1].argument.callee.arguments.length === 3 &&
        arg.body.body[1].argument.callee.arguments[0].type === 'ObjectExpression' &&
        arg.body.body[1].argument.callee.arguments[1].type === 'ObjectExpression' &&
        arg.body.body[1].argument.callee.arguments[2].type === 'ArrayExpression') {
      const modules = arg.body.body[1].argument.callee.arguments[0].properties;
      
      // verify modules is the expected data structure
      // in the process, extract external requires
      const externals = {};
      if (modules.every(m => {
        if (m.type !== 'Property' ||
            m.computed !== false ||
            m.key.type !== 'Literal' ||
            typeof m.key.value !== 'number' ||
            m.value.type !== 'ArrayExpression' ||
            m.value.elements.length !== 2 ||
            m.value.elements[0].type !== 'FunctionExpression' ||
            m.value.elements[1].type !== 'ObjectExpression')
          return false;
        
        // detect externals from undefined moduleMap values
        const moduleMap = m.value.elements[1].properties;
        for (const prop of moduleMap) {
          if (prop.type !== 'Property' ||
              (prop.value.type !== 'Identifier' && prop.value.type !== 'Literal') ||
              prop.key.type !== 'Literal' ||
              typeof prop.key.value !== 'string' ||
              prop.computed)
            return false;
          if (prop.value.type === 'Identifier' && prop.value.name === 'undefined')
            externals[prop.key.value] = true;
        }
        return true;
      })) {
        // if we have externals, inline them into the browserify cache for webpack to pick up
        const externalIds = Object.keys(externals);
        if (externalIds.length) {
          const cache = arg.body.body[1].argument.callee.arguments[1];
          const renderedExternals = externalIds.map(ext => `"${ext}": { exports: require("${ext}") }`).join(',\n  ');
          magicString.appendRight(cache.end - 1, renderedExternals);
          transformed = true;
        }
      }
    }
  }
  return { ast, scope, transformed };
}

const relocateRegEx = /_\_dirname|_\_filename|require\.main|node-pre-gyp|bindings|define|['"]\.\.?\//;

module.exports = function (code) {
  if (this.cacheable)
    this.cacheable();
  this.async();
  const id = this.resourcePath;
  const { cwd } = getOptions(this);

  if (id.endsWith('.json') || !code.match(relocateRegEx))
    return this.callback(null, code);

  const emitAsset = (assetPath) => {
    // JS assets to support require(assetPath) and not fs-based handling
    // NB package.json is ambiguous here...
    if (assetPath.endsWith('.js') || assetPath.endsWith('.mjs'))
      return;

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
          fs.readFile(assetPath, (err, source) => err ? reject(err) : resolve(source))
        ),
        await new Promise((resolve, reject) => 
          fs.stat(assetPath, (err, stats) => err ? reject(err) : resolve(stats.mode))
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
            fs.readFile(file, (err, source) => err ? reject(err) : resolve(source))
          ),
          await new Promise((resolve, reject) => 
            fs.stat(file, (err, stats) => err ? reject(err) : resolve(stats.mode))
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

  let pathId, pathImportIds = {};
  let fsId;
  let pregypId, bindingsId, nbindId;

  const shadowDepths = Object.create(null);
  shadowDepths.__filename = 0;
  shadowDepths.__dirname = 0;
  if (!isESM) {
    shadowDepths.require = 0;
  }
  else {
    for (const decl of ast.body) {
      // Detects:
      // import * as path from 'path';
      // import path from 'path';
      // import { join } from 'path';
      if (decl.type === 'ImportDeclaration') {
        const source = decl.source.value;
        if (source === 'path') {
          for (const impt of decl.specifiers) {
            if (impt.type === 'ImportNamespaceSpecifier' || impt.type === 'ImportDefaultSpecifier') {
              pathId = impt.local.name;
              shadowDepths[pathId] = 0;
            }
            else if (impt.type === 'ImportSpecifier') {
              pathImportIds[impt.local.name] = impt.imported.name;
              shadowDepths[impt.local.name] = 0;
            }
          }
        }
        // import binary from 'node-pre-gyp';
        // import * as binary from 'node-pre-gyp';
        // import { find } from 'node-pre-gyp' not yet implemented
        else if (isPregypId(source)) {
          for (const impt of decl.specifiers) {
            if (impt.type === 'ImportNamespaceSpecifier' || impt.type === 'ImportDefaultSpecifier') {
              pregypId = impt.local.name;
              shadowDepths[pregypId] = 0;
            }
          }
        }
        // import bindings from 'bindings';
        else if (source === 'bindings') {
          for (const impt of decl.specifiers) {
            if (impt.type === 'ImportDefaultSpecifier') {
              bindingsId = impt.local.name;
              shadowDepths[bindingsId] = 0;
            }
          }
        }
      }
    }
  }

  let transformed = false;

  let staticBindingsInstance = false;
  // calculate the base-level package folder to load bindings from
  const pkgBase = getPackageBase(id);
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
  function computeStaticValue (expr, bindingsReq) {
    staticBindingsInstance = false;
    // function expression analysis disabled due to static-eval locals bug
    if (expr.type === 'FunctionExpression')
      return;
    const vars = {};
    if (shadowDepths.__dirname === 0)
      vars.__dirname = path.resolve(id, '..');
    if (shadowDepths.__filename === 0)
      vars.__filename = id;
    if (pathId) {
      if (shadowDepths[pathId] === 0)
        vars[pathId] = path;
    }
    if (fsId) {
      if (shadowDepths[fsId] === 0)
        vars[fsId] = {
          existsSync: fs.existsSync
        };
    }
    if (pregypId) {
      if (shadowDepths[pregypId] === 0)
        vars[pregypId] = pregyp;
    }
    if (bindingsId) {
      if (shadowDepths[bindingsId] === 0)
        vars[bindingsId] = createBindings();
    }
    if (nbindId) {
      if (shadowDepths[nbindId] === 0)
        vars[nbindId] = getNbind();
    }
    for (const pathFn of Object.keys(pathImportIds)) {
      if (shadowDepths[pathFn] === 0)
        vars[pathFn] = path[pathImportIds[pathFn]];
    }
    if (bindingsReq && shadowDepths.require === 0)
      vars.require = function (reqId) {
        if (reqId === 'bindings')
          return createBindings();
      };

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
        shadowDepths.require === 0 &&
        node.arguments.length === 1 &&
        node.arguments[0].type === 'Literal';
  }

  // detect require(...) || require.resolve(...);
  function isRequire (node) {
    return node &&
        node.type === 'CallExpression' &&
        (node.callee.type === 'Identifier' &&
          node.callee.name === 'require' &&
          shadowDepths.require === 0 ||
          node.callee.type === 'MemberExpression' &&
          node.callee.object.type === 'Identifier' &&
          node.callee.object.name === 'require' &&
          node.callee.property.type === 'Identifier' &&
          node.callee.property.name === 'resolve');
  }

  ({ ast, scope, transformed } = handleWrappers(ast, scope, magicString, code.length));

  walk(ast, {
    enter (node, parent) {
      if (node.scope) {
        scope = node.scope;
        for (const id in node.scope.declarations) {
          if (id in shadowDepths)
            shadowDepths[id]++;
        }
      }

      if (staticChildNode)
        return this.skip();

      // detect asset leaf expression triggers (if not already)
      // __dirname,  __filename, binary only currently as well as require('bindings')(...)
      // Can add require.resolve, import.meta.url, even path-like environment variables
      if (node.type === 'Identifier' && isExpressionReference(node, parent)) {
        if (!shadowDepths[node.name]) {
          if (node.name === '__dirname' || node.name === '__filename' ||
              node.name === pregypId || node.name === bindingsId) {
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
      // special trigger for './asset.txt' references
      else if (node.type === 'Literal' && typeof node.value === 'string' &&
               (node.value.startsWith('./') || node.value.startsWith('../')) &&
               isExpressionReference(node, parent)) {
        staticChildValue = node.value;
        staticChildNode = node;
        staticChildValueBindingsInstance = staticBindingsInstance;
        return this.skip();
      }
      // require('bindings')('asdf')
      else if (node.type === 'CallExpression' &&  
          !isESM && isStaticRequire(node.callee) &&
          node.callee.arguments[0].value === 'bindings') {
        staticChildValue = computeStaticValue(node, true);
        if (staticChildValue) {
          staticChildNode = node;
          staticChildValueBindingsInstance = staticBindingsInstance;
          return this.skip();
        }
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
      else if (!isESM && node.type === 'MemberExpression' &&
               node.object.type === 'Identifier' &&
               node.object.name === 'require' &&
               !shadowDepths.require &&
               node.property.type === 'Identifier' &&
               node.property.name === 'main' &&
               !node.computed) {
        magicString.overwrite(node.object.start, node.object.end, '__non_webpack_require__');
        transformed = true;
      }

      // for now we only support top-level variable declarations
      // so "var { join } = require('path')" will only detect in the top scope.
      // Intermediate scope handling for these requires is straightforward, but
      // would need nested shadow depth handling of the pathIds.
      else if (parent === ast && node.type === 'VariableDeclaration') {
        for (const decl of node.declarations) {
          // var path = require('path')
          if (decl.id.type === 'Identifier' &&
              !isESM && isStaticRequire(decl.init)) {
            if (decl.init.arguments[0].value === 'path') {
              pathId = decl.id.name;
              shadowDepths[pathId] = 0;
              return this.skip();
            }
            // var fs = require('fs')
            else if (decl.init.arguments[0].value === 'fs') {
              fsId = decl.id.name;
              shadowDepths[fsId] = 0;
              return this.skip();
            }
            // var binary = require('node-pre-gyp')
            else if (isPregypId(decl.init.arguments[0].value)) {
              pregypId = decl.id.name;
              shadowDepths[pregypId] = 0;
              return this.skip();
            }
            // var bindings = require('bindings')
            else if (decl.init.arguments[0].value === 'bindings') {
              bindingsId = decl.id.name;
              shadowDepths[bindingsId] = 0;
              return this.skip();
            }
            // var nbind = require('nbind')
            else if (decl.init.arguments[0].value === 'nbind') {
              nbindId = decl.id.name;
              shadowDepths[nbindId] = 0;
            }
          }
          // var { join } = path | require('path');
          else if (decl.id.type === 'ObjectPattern' && decl.init &&
              (decl.init.type === 'Identifier' && decl.init.name === pathId && shadowDepths[pathId] === 0) ||
              !isESM && isStaticRequire(decl.init) && decl.init.arguments[0].value === 'path') {
            for (const prop of decl.id.properties) {
              if (prop.type !== 'Property' ||
                  prop.key.type !== 'Identifier' ||
                  prop.value.type !== 'Identifier')
                continue;
              pathImportIds[prop.value.name] = prop.key.name;
              shadowDepths[prop.key.name] = 0;
              return this.skip();
            }
          }
          // var join = path.join
          else if (decl.id.type === 'Identifier' &&
              decl.init &&
              decl.init.type === 'MemberExpression' &&
              decl.init.object.type === 'Identifier' &&
              decl.init.object.name === pathId &&
              shadowDepths[decl.init.object.name] === 0 &&
              decl.init.computed === false &&
              decl.init.property.type === 'Identifier') {
            pathImportIds[decl.init.property.name] = decl.id.name;
            shadowDepths[decl.id.name] = 0;
            return this.skip();
          }
        }
      }
      else if (node.type === 'AssignmentExpression') {
        // path = require('path')
        if (isStaticRequire(node.right) && node.right.arguments[0].value === 'path' &&
            node.left.type === 'Identifier' && scope.declarations[node.left.name]) {
          pathId = node.left.name;
          shadowDepths[pathId] = 0;
          return this.skip(); 
        }
      }
    },
    leave (node, parent) {
      if (node.scope) {
        scope = scope.parent;
        for (const id in node.scope.declarations) {
          if (id in shadowDepths) {
            shadowDepths[id]--;
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
        // no static value -> see if we should emit the asset if it exists
        // never inline an asset path into a require statement though
        let stats;
        if (typeof staticChildValue === 'string' && !isRequire(node)) {
          if (staticChildValue.startsWith('./') || staticChildValue.startsWith('../')) {
            staticChildValue = path.resolve(cwd, staticChildValue);
          }
          try {
            stats = fs.statSync(staticChildValue);
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