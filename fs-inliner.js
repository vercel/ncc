const path = require('path');
const fs = require('fs');
const { walk } = require('estree-walker');
const MagicString = require('magic-string');
const { attachScopes } = require('rollup-pluginutils');
const evaluate = require('static-eval');

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

exports.transform = function (code, id) {
  if (code.indexOf('readFileSync') === -1)
    return;
  
  const magicString = new MagicString(code);
  const ast = this.parse(code);
  let scope = attachScopes(ast, 'scope');

  let fsId, readFileSyncId;
  let pathId, pathImportIds = {};
  const shadowDepths = Object.create(null);
  shadowDepths.__filename = 0;
  shadowDepths.__dirname = 0;
  for (const decl of ast.body) {
    // Detects:
    // import * as fs from 'fs';
    // import fs from 'fs';
    // import { readFileSync } from 'fs';
    // import * as path from 'path';
    // import path from 'path';
    // import { join } from 'path';
    if (decl.type === 'ImportDeclaration') {
      const source = decl.source.value.startsWith('\u0000commonjs-proxy:') ? decl.source.value.substr(16) : decl.source.value;
      if (source === 'fs') {
        for (const impt of decl.specifiers) {
          if (impt.type === 'ImportNamespaceSpecifier' || impt.type === 'ImportDefaultSpecifier') {
            fsId = impt.local.name;
            shadowDepths[fsId] = 0;
          } else if (impt.type === 'ImportSpecifier' && impt.imported.name === 'readFileSync') {
            readFileSyncId = impt.local.name;
            shadowDepths[readFileSyncId] = 0;
          }
        }
      }
      else if (source === 'path') {
        for (const impt of decl.specifiers) {
          if (impt.type === 'ImportNamespaceSpecifier' || impt.type === 'ImportDefaultSpecifier') {
            pathId = impt.local.name;
            shadowDepths[pathId] = 0;
          } else if (impt.type === 'ImportSpecifier') {
            pathImportIds[impt.local.name] = impt.imported.name;
            shadowDepths[impt.local.name] = 0;
          }
        }
      }
    }
  }
  let didInline = false;

  function extractStaticFileSource (expr, id, enc) {
    const vars = {};
    if (shadowDepths.__filename === 0)
      vars.__dirname = path.resolve(id, '..');
    if (shadowDepths.__dirname === 0)
      vars.__filename = id;
    if (pathId) {
      if (shadowDepths[pathId] === 0)
        vars[pathId] = path;
      for (const pathFn of Object.keys(pathImportIds)) {
        if (shadowDepths[pathFn] === 0)
          vars[pathFn] = path[pathImportIds[pathFn]];
      }
    }

    // evaluate returns undefined for non-statically-analyzable
    const assetPath = evaluate(expr, vars);
    if (assetPath) {
      const source = fs.readFileSync(assetPath);
      if (enc) {
        try {
          return JSON.stringify(source.toString(enc));
        }
        catch (e) {
          return;
        }
      }
      else {
        const assetSource = source.toString('base64');
        return 'Buffer.from("' + assetSource + '", "base64")';
      }
    }
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

      // for now we only support top-level variable declarations
      // so "var { join } = path" will only work in the top scope.
      if (parent === ast && node.type === 'VariableDeclaration') {
        for (const decl of node.declarations) {
          // var { join } = path;
          if (decl.id.type === 'ObjectPattern' &&
              decl.init &&
              decl.init.type === 'Identifier' &&
              decl.init.name === pathId &&
              shadowDepths[pathId] === 0) {
            for (const prop of decl.id.properties) {
              if (prop.type !== 'Property' ||
                  prop.key.type !== 'Identifier' ||
                  prop.value.type !== 'Identifier')
                continue;
              pathImportIds[prop.value.name] = prop.key.name;
              shadowDepths[prop.key.name] = 0;
            }
          }
          // var join = path.join;
          if (decl.id.type === 'Identifier' &&
              decl.init &&
              decl.init.type === 'MemberExpression' &&
              decl.init.object.type === 'Identifier' &&
              decl.init.object.name === pathId &&
              shadowDepths.pathId === 0 &&
              decl.init.computed === false &&
              decl.init.property.type === 'Identifier') {
            pathImportIds[decl.init.property.name] = decl.id.name;
            shadowDepths[decl.id.name] = 0;
          }
        }
      }

      else if (node.type === 'MemberExpression') {
        if (parent.type === 'CallExpression' &&
            parent.callee === node &&
            (parent.arguments.length === 1 || parent.arguments.length === 2) &&
            node.object.type === 'Identifier' &&
            (node.object.name === 'fs' || (node.object.name === fsId && shadowDepths[fsId] === 0)) &&
            !scope.contains(fsId) &&
            node.property.type === 'Identifier' &&
            node.property.name === 'readFileSync') {
          const inlined = extractStaticFileSource(parent.arguments[0], id,
              parent.arguments[1] && parent.arguments[1].type === 'Literal' ? parent.arguments[1].value : null);
          if (inlined) {
            didInline = true;
            magicString.overwrite(parent.start, parent.end, inlined);
            return this.skip();
          }
        }
      }

      else if (parent && node.type === 'Identifier' &&
               isReference(node, parent) &&
               node.name === readFileSyncId &&
               !scope.contains(readFileSyncId) &&
               parent.type === 'CallExpression' &&
               parent.callee === node) {
        const inlined = extractStaticFileSource(parent.arguments[0], id);
        if (inlined) {
          didInline = true;
          magicString.overwrite(parent.start, parent.end, inlined);
          return this.skip();
        }
      }
    },
    leave (node) {
      if (node.scope) {
        scope = scope.parent;
        for (const id in node.scope.declarations) {
          if (id in shadowDepths)
            shadowDepths[id]--;
        }
      }
    }
  });

  if (didInline) {
    code = magicString.toString();
    const map = magicString.generateMap();
    
    return { code, map };
  }
};