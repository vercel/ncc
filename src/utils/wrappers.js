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

function handleWrappers (ast, scope, magicString) {
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

module.exports = handleWrappers;
