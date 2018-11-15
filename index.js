const rollup = require("rollup");
const nodeResolve = require("rollup-plugin-node-resolve");
const commonjs = require("rollup-plugin-commonjs");
const json = require("rollup-plugin-json");
const { terser } = require("rollup-plugin-terser");
const builtins = require("builtins")();
const fsInliner = require("./fs-inliner.js");

module.exports = async (input, { minify = true, sourcemap = false } = {}) => {
  const resolve = nodeResolve({
    module: false,
    jsnext: false,
    browser: false,
    preferBuiltins: true,
  });
  const bundle = await rollup.rollup({
    input,
    plugins: [
      resolve,
      commonjs({
        // simple optional dependencies detection
        async isMissing (id, parentId) {
          try {
            if (builtins[id] || await resolve.resolveId(id, parentId))
              return false;
          }
          catch {}
          return true;
        }
      }),
      json(),
      fsInliner,
      ...(minify ? [terser()] : [])
    ],
    external: builtins
  });

  return await bundle.generate({
    sourcemap,
    format: "cjs"
  });
};
