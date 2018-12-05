const terser = require("terser");
const { getOptions } = require('loader-utils');

module.exports = function (code) {
  const options = getOptions(this);
  const result = terser.minify(code, {
    compress: {
      keep_classnames: true,
      keep_fnames: true
    },
    mangle: {
      keep_classnames: true,
      keep_fnames: true
    },
    sourceMap: options.sourceMap
  });
  // For some reason, auth0 returns "undefined"!
  if (result.code === undefined)
    return this.callback(null, code);
  return this.callback(null, result.code, result.map);
};