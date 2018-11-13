# ncc

Simple CLI for compiling a Node.js module into a single file,
together with all its dependencies, gcc-style.

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
