# Multiple Bundles

This example shows how you could build a simple module along with a CLI.

## How to use

Within this directory, run `yarn` to install dependencies.

To build the main module, run `yarn build:main`. You'll notice the resulting `dist/main/index.js` only includes `main.js` and its `chalk` dependency.

To build the CLI, run `yarn build:cli`. You'll notice the resulting `dist/cli/index.js` includes its `args` dependency in addition to everything required for `main.js`.

_To build both concurrently, run `yarn build`._

To test the main module, run `yarn test`. You'll notice it uses a `strip-ansi` dependency that is not included in any of the builds.

To use the built CLI, run `./dist/cli/index.js color` or `./dist/cli/index.js number`. If this were published to npm as "lucky", you would be able to run `lucky color` or `lucky number` because of the `bin` declaration in `package.json`.
