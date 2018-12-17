const terser = require("terser");
const { getOptions } = require('loader-utils');

module.exports = function (code) {
  if (this.cacheable)
    this.cacheable();
  const options = getOptions(this);
  const result = terser.minify(code, {
    compress: false,
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