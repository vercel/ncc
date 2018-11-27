const path = require('path');
const fs = require('fs');
const { walk } = require('estree-walker');
const MagicString = require('magic-string');
const { attachScopes } = require('rollup-pluginutils');
const evaluate = require('static-eval');
const acorn = require('acorn');

// Very basic first-pass fs.readFileSync inlining
function isReference(node, parent) {
	if (parent.type === 'MemberExpression') return parent.computed || node === parent.object;

	// disregard the `bar` in { bar: foo }
	if (parent.type === 'Property' && node !== parent.value) return false;

	// disregard the `bar` in `class Foo { bar () {...} }`
	if (parent.type === 'MethodDefinition') return false;

	// disregard the `bar` in `export { foo as bar }`
	if (parent.type === 'ExportSpecifier' && node !== parent.local) return false;

	return true;
}

const assetRegEx = /_\_dirname|_\_filename/;
module.exports = function (code) {
  const id = this.resourcePath;

  if (id.endsWith('.json') || !code.match(assetRegEx))
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
      }
    }
  }
  let didRelocate = false;

  function computeStaticValue (expr, id) {
    // function expression analysis disabled due to static-eval locals bug
    if (expr.type === 'FunctionExpression')
      return;
    const vars = {};
    if (shadowDepths.__filename === 0)
      vars.__dirname = path.resolve(id, '..');
    if (shadowDepths.__dirname === 0)
      vars.__filename = id;
    if (pathId) {
      if (shadowDepths[pathId] === 0)
        vars[pathId] = path;
    }
    for (const pathFn of Object.keys(pathImportIds)) {
      if (shadowDepths[pathFn] === 0)
        vars[pathFn] = path[pathImportIds[pathFn]];
    }

    // evaluate returns undefined for non-statically-analyzable
    return evaluate(expr, vars);
  }

  // statically determinable leaves are tracked, and inlined when the
  // greatest parent statically known leaf computation corresponds to an asset path
  let staticChildNode, staticChildValue;

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
      // __dirname and __filename only currently
      // Can add require.resolve, import.meta.url, even path-like environment variables
      if (node.type === 'Identifier' && isReference(node, parent)) {
        if (!shadowDepths[node.name] &&
            (node.name === '__dirname' || node.name === '__filename')) {
          curStaticValue = computeStaticValue(node, id);
          // if it computes, then we start backtracking
          if (curStaticValue) {
            staticChildNode = node;
            return this.skip();
          }
        }
      }

      // for now we only support top-level variable declarations
      // so "var { join } = require('path')" will only detect in the top scope.
      // Intermediate scope handling for these requires is straightforward, but
      // would need nested shadow depth handling of the pathIds.
      if (parent === ast && node.type === 'VariableDeclaration') {
        for (const decl of node.declarations) {
          // var path = require('path')
          if (decl.id.type === 'Identifier' &&
              !isESM && isStaticRequire(decl.init) &&
              decl.init.arguments[0].value === 'path') {
            pathId = decl.id.name;
            shadowDepths[pathId] = 0;
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
            }
          }
          // var join = path.join | require('path').join;
          else if (decl.id.type === 'Identifier' &&
              decl.init &&
              decl.init.type === 'MemberExpression' &&
              decl.init.object.type === 'Identifier' &&
              decl.init.object.name === pathId &&
              shadowDepths[pathId] === 0 &&
              decl.init.computed === false &&
              decl.init.property.type === 'Identifier') {
            pathImportIds[decl.init.property.name] = decl.id.name;
            shadowDepths[decl.id.name] = 0;
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
        const curStaticValue = computeStaticValue(node, id);
        if (curStaticValue) {
          staticChildNode = node;
          staticChildValue = curStaticValue;
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
          const replacement = emitAsset(path.resolve(staticChildValue));
          if (replacement) {
            didRelocate = true;
            magicString.overwrite(staticChildNode.start, staticChildNode.end, replacement);
          }
          staticChildNode = staticChildValue = undefined;
        }
      }
    }
  });

  if (!didRelocate)
    return this.callback(null, code);

  code = magicString.toString();
  const map = magicString.generateMap();

  this.callback(null, code, map);
};
