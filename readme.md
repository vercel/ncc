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

### CLI

```bash
$ ncc build input.js -o dist
```

Outputs the build of `input.js` into `dist/index.js`.

```bash
$ ncc run input.js
```

Build to a temporary folder and run the built JS file through Node.js, with source maps support for debugging.

### With TypeScript

The only requirement is to point `ncc` to `.ts` or `.tsx` files. A `tsconfig.json`
file is necessary. Most likely you want to indicate `es2015` support:

```json
{
  "compilerOptions": {
    "target": "es2015"
  }
}
```

### Programmatically From Node.js

```js
require('@zeit/ncc')('/path/to/input', {
  minify: true, // default
  // externals to leave as requires of the build
  externals: ["externalpackage"],
  sourceMap: true // default
}).then(({ code, assets }) => {
  console.log(code);
  // assets is an object of asset file names to sources
  // expected relative to the output code (if any)
})
```

## Caveats

- Files / assets are relocated based on a static evaluator. Dynamic non-statically analyzable asset loads may not work out correctly
