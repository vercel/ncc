const path = require('path');
const { getOptions } = require('loader-utils');
const getUniqueAssetName = require('../utils/dedupe-names');
const sharedlibEmit = require('../utils/sharedlib-emit');
const getPackageBase = require('../utils/get-package-base');

module.exports = async function (content) {
  if (this.cacheable)
    this.cacheable();
  this.async();

  const id = this.resourcePath;
  const options = getOptions(this);

  const pkgBase = getPackageBase(this.resourcePath) || path.dirname(id);
  await sharedlibEmit(pkgBase, this.emitFile);

  const name = getUniqueAssetName(id.substr(pkgBase.length + 1), id, options.assetNames);
  this.emitFile(name, content);

  this.callback(null, 'module.exports = __non_webpack_require__("./' + name + '")');
};
module.exports.raw = true;
