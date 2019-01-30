/*
 * Adapted from https://github.com/substack/static-eval
 * © 2013 - 2017 substack (James Halliday)
 *
 * This software is released under the MIT license:
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

// var unparse = require('escodegen').generate;

module.exports = function (ast, vars = {}) {
  return walk(ast);

  // walk returns:
  // 1. Single known value: { value: value }
  // 2. Conditional value: { test, then, else }
  // 3. Unknown value: undefined

  function walk (node, scopeVars) {
    if (node.type === 'Literal') {
      return { value: node.value };
    }
    else if (node.type === 'UnaryExpression'){
      var val = walk(node.argument);
      if ('value' in val) {
        if (node.operator === '+') return { value: +val.value };
        if (node.operator === '-') return { value: -val.value };
        if (node.operator === '~') return { value: ~val.value };
        if (node.operator === '!') return { value: !val.value };
      }
      else if ('test' in val) {
        if (node.operator === '+') return { test: val.test, then: +val.then, else: +val.else };
        if (node.operator === '-') return { test: val.test, then: -val.then, else: -val.else };
        if (node.operator === '~') return { test: val.test, then: ~val.then, else: ~val.else };
        if (node.operator === '!') return { test: val.test, then: !val.then, else: !val.else };
      }
      return;
    }
    else if (node.type === 'ArrayExpression') {
      var xs = [];
      for (var i = 0, l = node.elements.length; i < l; i++) {
        var x = walk(node.elements[i]);
        if (!x) return;
        if ('test' in x) return;          
        xs.push(x.value);
      }
      return { value: xs };
    }
    else if (node.type === 'ObjectExpression') {
      var obj = {};
      for (var i = 0; i < node.properties.length; i++) {
        var prop = node.properties[i];
        var keyValue = prop.computed ? walk(prop.key) : { value: prop.key.name || prop.key.value };
        if (!keyValue || 'test' in keyValue) return;
        var value = walk(prop.value);
        if (!value || 'test' in value) return;
        obj[keyValue.value] = value.value;
      }
      return obj;
    }
    else if (node.type === 'BinaryExpression' || node.type === 'LogicalExpression') {
      var l = walk(node.left);
      if (!l) return;
      var r = walk(node.right);
      if (!r) return;

      if ('test' in l && 'test' in r)
        return;

      var op = node.operator;
      // support right branches only
      if ('test' in l) {
        r = r.value;
        if (op === '==') return { test: l.test, then: l.then == r, else: l.else == r };
        if (op === '===') return { test: l.test, then: l.then === r, else: l.else === r };
        if (op === '!=') return { test: l.test, then: l.then != r, else: l.else != r };
        if (op === '!==') return { test: l.test, then: l.then !== r, else: l.else !== r };
        if (op === '+') return { test: l.test, then: l.then + r, else: l.else + r };
        if (op === '-') return { test: l.test, then: l.then - r, else: l.else - r };
        if (op === '*') return { test: l.test, then: l.then * r, else: l.else * r };
        if (op === '/') return { test: l.test, then: l.then / r, else: l.else / r };
        if (op === '%') return { test: l.test, then: l.then % r, else: l.else % r };
        if (op === '<') return { test: l.test, then: l.then < r, else: l.else < r };
        if (op === '<=') return { test: l.test, then: l.then <= r, else: l.else <= r };
        if (op === '>') return { test: l.test, then: l.then > r, else: l.else > r };
        if (op === '>=') return { test: l.test, then: l.then >= r, else: l.else >= r };
        if (op === '|') return { test: l.test, then: l.then | r, else: l.else | r };
        if (op === '&') return { test: l.test, then: l.then & r, else: l.else & r };
        if (op === '^') return { test: l.test, then: l.then ^ r, else: l.else ^ r };
        if (op === '&&') return { test: l.test, then: l.then && r, else: l.else && r };
        if (op === '||') return { test: l.test, then: l.then || r, else: l.else || r };
      }
      else if ('test' in r) {
        l = l.value;
        if (op === '==') return { test: r.test, then: l == r.then, else: l == r.else };
        if (op === '===') return { test: r.test, then: l === r.then, else: l === r.else };
        if (op === '!=') return { test: r.test, then: l != r.then, else: l != r.else };
        if (op === '!==') return { test: r.test, then: l !== r.then, else: l !== r.else };
        if (op === '+') return { test: r.test, then: l + r.then, else: l + r.else };
        if (op === '-') return { test: r.test, then: l - r.then, else: l - r.else };
        if (op === '*') return { test: r.test, then: l * r.then, else: l * r.else };
        if (op === '/') return { test: r.test, then: l / r.then, else: l / r.else };
        if (op === '%') return { test: r.test, then: l % r.then, else: l % r.else };
        if (op === '<') return { test: r.test, then: l < r.then, else: l < r.else };
        if (op === '<=') return { test: r.test, then: l <= r.then, else: l <= r.else };
        if (op === '>') return { test: r.test, then: l > r.then, else: l > r.else };
        if (op === '>=') return { test: r.test, then: l >= r.then, else: l >= r.else };
        if (op === '|') return { test: r.test, then: l | r.then, else: l | r.else };
        if (op === '&') return { test: r.test, then: l & r.then, else: l & r.else };
        if (op === '^') return { test: r.test, then: l ^ r.then, else: l ^ r.else };
        if (op === '&&') return { test: r.test, then: l && r.then, else: l && r.else };
        if (op === '||') return { test: r.test, then: l || r.then, else: l || r.else };
      }
      else {
        l = l.value;
        r = r.value;
        if (op === '==') return { value: l == r };
        if (op === '===') return { value: l === r };
        if (op === '!=') return { value: l != r };
        if (op === '!==') return { value: l !== r };
        if (op === '+') return { value: l + r };
        if (op === '-') return { value: l - r };
        if (op === '*') return { value: l * r };
        if (op === '/') return { value: l / r };
        if (op === '%') return { value: l % r };
        if (op === '<') return { value: l < r };
        if (op === '<=') return { value: l <= r };
        if (op === '>') return { value: l > r };
        if (op === '>=') return { value: l >= r };
        if (op === '|') return { value: l | r };
        if (op === '&') return { value: l & r };
        if (op === '^') return { value: l ^ r };
        if (op === '&&') return { value: l && r };
        if (op === '||') return { value: l || r };
      }      
      return;
    }
    else if (node.type === 'Identifier') {
      if (Object.hasOwnProperty.call(vars, node.name))
        return { value: vars[node.name] };
      return;
    }
    else if (node.type === 'ThisExpression') {
      if (Object.hasOwnProperty.call(vars, 'this'))
        return { value: vars['this'] };
      return;
    }
    else if (node.type === 'CallExpression') {
      var callee = walk(node.callee);
      if (!callee || 'test' in callee) return;
      if (typeof callee.value !== 'function') return;
      
      var ctx = node.callee.object && walk(node.callee.object).value || null;

      var args = [];
      for (var i = 0, l = node.arguments.length; i < l; i++) {
        var x = walk(node.arguments[i]);
        if (!x || 'test' in x) return;
        args.push(x.value);
      }
      try {
        return { value: callee.value.apply(ctx, args) };
      }
      catch (e) {
        return;
      }
    }
    else if (node.type === 'MemberExpression') {
      var obj = walk(node.object);
      // do not allow access to methods on Function 
      if (!obj || 'test' in obj || typeof obj.value === 'function')
        return;
      if (node.property.type === 'Identifier')
        return { value: obj.value[node.property.name] };
      var prop = walk(node.property);
      if (!prop || 'test' in prop)
        return;
      return { value: obj.value[prop.value] };
    }
    else if (node.type === 'ConditionalExpression') {
      var val = walk(node.test);
      if (val && 'value' in val)
        return val.value ? walk(node.consequent) : walk(node.alternate);

      var thenValue = walk(node.consequent);
      if (!thenValue || 'test' in thenValue)
        return;
      var elseValue = walk(node.alternate);
      if (!elseValue || 'test' in elseValue)
        return;

      return {
        test: node.test,
        then: thenValue.value,
        else: elseValue.value
      };
    }
    else if (node.type === 'ExpressionStatement') {
      return walk(node.expression);
    }
    else if (node.type === 'ReturnStatement') {
      return walk(node.argument);
    }
    // disabled for now due to a scope bug in the original implementation
    /* else if (node.type === 'FunctionExpression') {
      var bodies = node.body.body;
      
      // Create a "scope" for our arguments
      var oldVars = {};
      Object.keys(vars).forEach(function(element){
        oldVars[element] = vars[element];
      });

      node.params.forEach(function(key) {
        if(key.type == 'Identifier'){
          vars[key.name] = null;
        }
      });
      for(var i in bodies){
        if(walk(bodies[i]) === FAIL){
          return FAIL;
        }
      }
      // restore the vars and scope after we walk
      vars = oldVars;
      
      var keys = Object.keys(vars);
      var vals = keys.map(function(key) {
        return vars[key];
      });
      return Function(keys.join(', '), 'return ' + unparse(node)).apply(null, vals);
    } */
    else if (node.type === 'TemplateLiteral') {
      var val = { value: '' };
      for (var i = 0; i < node.expressions.length; i++) {
        if ('value' in val) {
          val.value += node.quasis[i].value.cooked;
        }
        else {
          val.then += node.quasis[i].value.cooked;
          val.else += node.quasis[i].value.cooked;
        }
        var exprValue = walk(node.expressions[i]);
        if (!exprValue)
          return;
        if ('value' in exprValue) {
          if ('value' in val) {
            val.value += exprValue.value;
          }
          else {
            val.then += exprValue.value;
            val.else += exprValue.value;
          }
        }
        else {
          // only support a single branch in a template
          if ('value' in val === false)
            return;
          val = {
            test: exprValue.test,
            then: val.value + exprValue.then,
            else: val.value + exprValue.else
          };
        }
      }
      if ('value' in val) {
        val.value += node.quasis[i].value.cooked;
      }
      else {
        val.then += node.quasis[i].value.cooked;
        val.else += node.quasis[i].value.cooked;
      }
      return val;
    }
    /* else if (node.type === 'TaggedTemplateExpression') {
      var tag = walk(node.tag);
      var quasi = node.quasi;
      var strings = quasi.quasis.map(walk);
      var values = quasi.expressions.map(walk);
      return tag.apply(null, [strings].concat(values));
    } */
    return;
  }
};
