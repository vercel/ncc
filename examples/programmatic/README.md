# Programmatic

This example shows how you can programmatically build multiple bundles. The build script (`scripts/build.js`) finds `.js` files in `src/routes/`, builds each one with `ncc`, and then writes the resulting file and its sourcemap to a new directory in `dist/`.

## How to use

Within this directory, run `yarn` to install dependencies.

To run a development server with `ncc`, run `yarn dev`. You can then test the routes:

- [http://localhost:3000/cat]()
- [http://localhost:3000/dog]()
- [http://localhost:3000/fox]()

To build all of the bundles, run `yarn build`.

```
❯ yarn build
yarn run v1.12.3
$ node ./scripts/build.js
✓ dist/dog/index.js (289.17KB)
✓ dist/dog/index.map.js (234.37KB)
✓ dist/fox/index.js (289.18KB)
✓ dist/fox/index.map.js (234.43KB)
✓ dist/cat/index.js (289.17KB)
✓ dist/cat/index.map.js (234.43KB)
✨  Done in 2.79s.
```

Each subdirectory of `dist/` could be deployed to [a serverless environment](https://zeit.co/examples/nodejs/) to run independent of each other!

## Thanks

Special thanks to [random.cat](http://random.cat/), [AdenFlorian/random.dog](https://github.com/AdenFlorian/random.dog), and [xinitrc-dev/randomfox.ca](https://github.com/xinitrc-dev/randomfox.ca) for their open APIs to make this example more fun and realistic!
