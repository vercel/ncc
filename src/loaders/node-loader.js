const path = require('path');
const getUniqueAssetName = require('../utils/dedupe-names');
const sharedlibEmit = require('../utils/sharedlib-emit');
const getPackageBase = require('../utils/get-package-base');
const fs = require('fs');

module.exports = async function (content) {
  if (this.cacheable)
    this.cacheable();
  this.async();

  const id = this.resourcePath;

  const pkgBase = getPackageBase(this.resourcePath) || path.dirname(id);
  await sharedlibEmit(pkgBase, assetState, this.emitFile);

  const name = getUniqueAssetName(id.substr(pkgBase.length + 1), id, assetState.assetNames);
  
  const permissions = await new Promise((resolve, reject) => 
    fs.stat(id, (err, stats) => err ? reject(err) : resolve(stats.mode))
  )
  assetState.assetPermissions[name] = permissions;
  this.emitFile(name, content);

  this.callback(null, 'module.exports = __non_webpack_require__("./' + name + '")');
};
module.exports.raw = true;
let assetState;
module.exports.setAssetState = function (state) {
  assetState = state;
}