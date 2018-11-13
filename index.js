const rollup = require("rollup");
const resolve = require("rollup-plugin-node-resolve");
const commonjs = require("rollup-plugin-commonjs");
const json = require("rollup-plugin-json");
const { terser } = require("rollup-plugin-terser");
const builtins = require("builtins")();

module.exports = async (input, { minify = true } = {}) => {
  const bundle = await rollup.rollup({
    input,
    plugins: [resolve(), commonjs(), json(), ...(minify ? [terser()] : null)],
    external: builtins
  });

  return await bundle.generate({
    format: "cjs"
  });
};
