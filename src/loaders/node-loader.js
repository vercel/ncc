const { getOptions } = require('loader-utils');
const getUniqueAssetName = require('../utils/dedupe-names');

module.exports = function (content) {
  if (this.cacheable)
    this.cacheable();

  const id = this.resourcePath;
  const options = getOptions(this);

  const name = getUniqueAssetName(id, options.assetNames);
  this.emitFile(name, content);
  
  return 'module.exports = __non_webpack_require__("./' + name + '")';
};
module.exports.raw = true;
