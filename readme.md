# ncc

Simple CLI for compiling a Node.js module into a single file,
together with all its dependencies, gcc-style.

## webpack changes

Fixed a bug where webpack was setting `require` to `undefined`
if a program tries to override `require` with an `if` statement:

https://github.com/felixge/node-formidable/issues/337

Change in `webpack/lib/dependencies/CommonJsPlugin.js`:

```
+                                       //parser.hooks.assign.for("require").tap("CommonJsPlugin", expr => {
+                                       //// to not leak to global "require", we need to define a local require here.
+                                       //const dep = new ConstDependency("var require;", 0);
+                                       //dep.loc = expr.loc;
+                                       //parser.state.current.addDependency(dep);
+                                       //parser.scope.definitions.add("require");
+                                       //return true;
+                                       //});
```

## Motivation

`ncc` allows for using and testing rollup quickly, without
special configuration.

## Usage

### CLI

```bash
$ ncc input.js -o bundle.js
```

### Node.js

```js
require('@zeit/ncc')('/path/to/input', {
  minify: true  // default
}).then(bundle => {
  // result of rollup `bundle.generate()` call
  console.log(bundle.code)
})
```

## TODO

- [ ] Make self-hosting
