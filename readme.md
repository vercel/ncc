# ncc

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
- Only support Node.js (soon, optionally with TypeScript) codebases
- Make it work as well as possible with the entire Node.js / npm ecosystem

## Usage

### CLI

```bash
$ ncc build input.js -o dist
```

Outputs the build of `input.js` into `dist/index.js`.

```bash
$ ncc run input.js
```

Build to a temporary folder and run the built JS file through Node.js.

### Node.js

```js
require('@zeit/ncc')('/path/to/input', {
  minify: true  // default
}).then(({ code, assets }) => {
  console.log(code);
  // assets is an object of asset file names to sources
  // expected relative to the output code (if any)
})
```

## Known issues

- [ ] Minification is creating problems
- [ ] Native modules are not supported

## Caveats

- Files / assets are relocated based on a static evaluator. Dynamic non-statically analyzable asset loads may not work out correctly.
- Dynamic requires are inlined only so far as they are statically analyzable. There may be ways to improve this as discussed in https://github.com/zeit/ncc/issues/41.
