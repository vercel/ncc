const { getOptions } = require('loader-utils');
const getUniqueAssetName = require('../utils/dedupe-names');
const sharedlibEmit = require('../utils/sharedlib-emit');

module.exports = function (content) {
  if (this.cacheable)
    this.cacheable();

  const id = this.resourcePath;
  const options = getOptions(this);

  const name = getUniqueAssetName(id, options.assetNames);
  sharedlibEmit(id, this.emitFile);  
  this.emitFile(name, content);
  
  return 'module.exports = __non_webpack_require__("./' + name + '")';
};
module.exports.raw = true;
