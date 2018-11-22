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
$ ncc input.js -o bundle.js
```

### Node.js

```js
require('@zeit/ncc')('/path/to/input', {
  minify: true  // default
}).then(code => {
  console.log(code)
})
```

## Known issues

- [ ] Minification is creating problems
- [ ] FS inlining is not implemented
- [ ] Native modules are not supported
