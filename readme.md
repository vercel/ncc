# ncc

[![Build Status](https://circleci.com/gh/zeit/ncc.svg?&style=shield)](https://circleci.com/gh/zeit/workflows/ncc)
[![codecov](https://codecov.io/gh/zeit/ncc/branch/master/graph/badge.svg)](https://codecov.io/gh/zeit/ncc)

Simple CLI for compiling a Node.js module into a single file,
together with all its dependencies, gcc-style.

## Motivation

- Publish minimal packages to npm
- Only ship relevant app code to serverless environments
- Don't waste time configuring bundlers
- Generally faster bootup time and less I/O overhead
- Compiled language-like experience (e.g.: `go`)

## Design goals

- Zero configuration
- TypeScript built-in
- Only supports Node.js programs as input / output
- Support all Node.js patterns and npm modules

## Usage

### Installation
```bash
npm i -g @zeit/ncc
```

### Usage

```bash
$ ncc build input.js -o dist
```

Outputs the Node.js compact build of `input.js` into `dist/index.js`.

It is also possible to build multiple files in a code-splitting build by passing additional inputs.

### Execution Testing

For testing and debugging, a file can be built into a temporary directory and executed with full source maps support with the command:

```bash
$ ncc run input.js
```

### With TypeScript

The only requirement is to point `ncc` to `.ts` or `.tsx` files. A `tsconfig.json`
file is necessary. Most likely you want to indicate `es2015` support:

```json
{
  "compilerOptions": {
    "target": "es2015",
    "moduleResolution": "node"
  }
}
```

### Package Support

Some packages may need some extra options for ncc support in order to better work with the static analysis.

See [package-support.md](package-support.md) for some common packages and their usage with ncc.

### Programmatically From Node.js

```js
require('@zeit/ncc')('/path/to/input', {
  // provide a custom cache path or disable caching
  cache: "./custom/cache/path" | false,
  // externals to leave as requires of the build
  externals: ["externalpackage"],
  minify: false, // default
  sourceMap: false, // default
  sourceMapBasePrefix: '../' // default treats sources as output-relative
  // when outputting a sourcemap, automatically include
  // source-map-support in the output file (increases output by 32kB).
  sourceMapRegister: true, // default
  watch: false, // default
  v8cache: false, // default
  quiet: false, // default
  debugLog = false // default
}).then(({ files, symlinks }) => {
  // files: an object of file names to { source, permissions }
  // symlinks: an object of symlink mappings required for the build
  // The main file is located at 'index.js':
  files['index.js'].source
})
```

Multiple entry points can be built by providing an object to build. In this case, those files are avaiable as additional output files:

```js
require('@zeit/ncc')({
  entry1: '/path/to/input1',
  entry2: '/path/to/input2
}).then(({ files, symlinks }) => {
  // named entry points are available at their names:
  files['entry1.js'].source
  files['entry1.js.map'].source
  files['entry2.js'].source
  // ... assets
});
```

When `watch: true` is set, the build object is not a promise, but has the following signature:

```js
{
  // handler re-run on each build completion
  // watch errors are reported on "err"
  handler (({ err, files, symlinks }) => { ... })
  // handler re-run on each rebuild start
  rebuild (() => {})
  // close the watcher
  void close ();
}
```

## Caveats

- Files / assets are relocated based on a [static evaluator](https://github.com/zeit/webpack-asset-relocator-loader#how-it-works). Dynamic non-statically analyzable asset loads may not work out correctly
