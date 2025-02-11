// npx webpack-cli
// --output-path=./test/unit/node2020/
// --output-filename=output.js
// --target=es2022

// ./test/unit/node2020/input.js

module.exports = {
  entry: './input.js',
  mode: 'none',
  output: {
    path: __dirname,
    filename: 'output.js',
    chunkFormat: 'commonjs',
    clean: {
      keep(asset) {
        return !asset.includes('output.js');
      }
    },
  },
  // target: 'es2023',
  // target: 'browserslist: node 16',
  target: 'node16',
};
