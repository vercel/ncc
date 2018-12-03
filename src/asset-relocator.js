const path = require('path');
const fs = require('fs');
const { walk } = require('estree-walker');
const MagicString = require('magic-string');
const { attachScopes } = require('rollup-pluginutils');
const evaluate = require('static-eval');
const acorn = require('acorn');
const bindings = require('bindings');

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

const relocateRegEx = /_\_dirname|_\_filename|require\.main|node-pre-gyp|bindings/;
module.exports = function (code) {
  const id = this.resourcePath;

  if (id.endsWith('.json') || !code.match(relocateRegEx))
    return this.callback(null, code);

  const assetNames = Object.create(null);
  const emitAsset = (assetPath) => {
    // JS assets to support require(assetPath) and not fs-based handling
    // NB package.json is ambiguous here...
    if (assetPath.endsWith('.js') || assetPath.endsWith('.mjs'))
      return;

    // console.log('Emitting ' + assetPath + ' for module ' + id);
    const basename = path.basename(assetPath);
    const ext = path.extname(basename);
    let name = basename, i = 0;
    while (name in assetNames && assetNames[name] !== assetPath)
      name = basename.substr(0, basename.length - ext.length) + ++i + ext;
    assetNames[name] = assetPath;

    this.emitFile(name, fs.readFileSync(assetPath));
    return "__dirname + '/" + JSON.stringify(name).slice(1, -1) + "'";
  };

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
  let pregypId, bindingsId;

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
  function createBindings (id) {
    return (opts = {}) => {
      if (typeof opts === 'string')
        opts = { bindings: opts };
      if (!opts.path) {
        opts.path = true;
        staticBindingsInstance = true;
      }
      opts.module_root = path.dirname(id);
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
    if (pregypId) {
      if (shadowDepths[pregypId] === 0)
        vars[pregypId] = pregyp;
    }
    if (bindingsId) {
      if (shadowDepths[bindingsId] === 0)
        vars[bindingsId] = createBindings(id);
    }
    for (const pathFn of Object.keys(pathImportIds)) {
      if (shadowDepths[pathFn] === 0)
        vars[pathFn] = path[pathImportIds[pathFn]];
    }
    if (bindingsReq && shadowDepths.require === 0)
      vars.require = function (reqId) {
        if (reqId === 'bindings')
          return createBindings(id);
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
        if ((node.name === '__dirname' ||
            node.name === '__filename' ||
            node.name === pregypId || node.name === bindingsId) && !shadowDepths[node.name]) {
          staticChildValue = computeStaticValue(node, false);
          // if it computes, then we start backtracking
          if (staticChildValue) {
            staticChildNode = node;
            staticChildValueBindingsInstance = staticBindingsInstance;
            return this.skip();
          }
        }
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
    },
    leave (node, parent) {
      if (node.scope) {
        scope = scope.parent;
        for (const id in node.scope.declarations) {
          if (id in shadowDepths)
            shadowDepths[id]--;
        }
      }

      // computing a static expression outward
      // -> compute and backtrack
      if (staticChildNode) {
        const curStaticValue = computeStaticValue(node, false);
        if (curStaticValue) {
          staticChildValue = curStaticValue;
          staticChildNode = node;
          staticChildValueBindingsInstance = staticBindingsInstance;
          return;
        }
        // no static value -> see if we should emit the asset if it exists
        // Currently we only handle files. In theory whole directories could also be emitted if necessary.
        let isFile = false;
        if (typeof staticChildValue === 'string') {
          try {
            isFile = fs.statSync(staticChildValue).isFile();
          }
          catch (e) {}
        }
        if (isFile) {
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
          staticChildNode = staticChildValue = undefined;
        }
      }
    }
  });

  if (!transformed)
    return this.callback(null, code);

  code = magicString.toString();
  const map = magicString.generateMap();

  this.callback(null, code, map);
};
