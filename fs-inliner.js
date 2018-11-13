const path = require('path');
const fs = require('fs');
const { walk } = require('estree-walker');
const MagicString = require('magic-string');
const { attachScopes } = require('rollup-pluginutils');

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

/*
 * For now we only support one expression type:
 * __dirname + '/asset.name'
 * 
 */
function extractStaticFileSource (expr, id, scope) {
  if (expr.type === 'BinaryExpression' &&
      expr.left.type === 'Identifier' &&
      expr.left.name === '__dirname' &&
      !scope.contains('__dirname') &&
      expr.right.type === 'Literal') {
    const assetPath = path.resolve(id, '..', expr.right.value.substr(1));
    const assetSource = fs.readFileSync(assetPath).toString('base64');
    return 'Buffer.from("' + assetSource + '", "base64")';
  }
}

exports.transform = function (code, id) {
  if (code.indexOf('readFileSync') === -1)
    return;
  
  const magicString = new MagicString(code);
  const ast = this.parse(code);
  let scope = attachScopes(ast, 'scope');

  let fsId, readFileSyncId;
  let fsShadowDepth = 0;
  let readFileSyncShadowDepth = 0;
  for (const decl of ast.body) {
    // Detects:
    // import * as fs from 'fs';
    // import fs from 'fs';
    // import { readFileSync } from 'fs';
    if (decl.type === 'ImportDeclaration' &&
        (decl.source.value === 'fs' || decl.source.value === '\u0000commonjs-proxy:fs')) {
      for (const impt of decl.specifiers) {
        if (impt.type === 'ImportNamespaceSpecifier' || impt.type === 'ImportDefaultSpecifier') {
          fsId = impt.local.name;
        } else if (impt.type === 'ImportSpecifier' && impt.imported.name === 'readFileSync') {
          readFileSyncId = impt.local.name;
        }
      }
    }
  }
  let didInline = false;

  walk(ast, {
    enter (node, parent) {
      if (node.scope) {
        scope = node.scope;
        if (node.scope.declarations[fsId])
          fsShadowDepth++
        if (node.scope.declarations[readFileSyncId])
          readFileSyncShadowDepth++;
      }

      if (node.type === 'MemberExpression') {
        if (parent.type === 'CallExpression' &&
            parent.callee === node &&
            parent.arguments.length === 1 &&
            node.object.type === 'Identifier' &&
            (node.object.name === 'fs' || (fsShadowDepth === 0 && node.object.name === fsId)) &&
            node.property.type === 'Identifier' &&
            node.property.name === 'readFileSync') {
          const inlined = extractStaticFileSource(parent.arguments[0], id, scope);
          if (inlined) {
            didInline = true;
            magicString.overwrite(parent.start, parent.end, inlined);
            return this.skip();
          }
        }
      }

      else if (node.type === 'Identifier' &&
               isReference(node, parent) &&
               readFileSyncShadowDepth === 0 &&
               node.name === readFileSyncId &&
               parent.type === 'CallExpression' &&
               parent.callee === node) {
        const inlined = extractStaticFileSource(parent.arguments[0], id, scope);
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
        if (node.scope.declarations[fsId])
          fsShadowDepth--;
        if (node.scope.declarations[readFileSyncId])
          readFileSyncShadowDepth--;
      }
    }
  });

  if (didInline) {
    code = magicString.toString();
    const map = magicString.generateMap();
    
    return { code, map };
  }
};