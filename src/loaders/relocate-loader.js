const relocate = require("@vercel/webpack-asset-relocator-loader");
const { expandDirnameShorthand } = require("./expand-shorthand-loader");

function relocateLoader(input, map) {
  return relocate.call(this, expandDirnameShorthand(input), map);
}

relocateLoader.initAssetCache = relocate.initAssetCache;
relocateLoader.getAssetMeta = relocate.getAssetMeta;
relocateLoader.getSymlinks = relocate.getSymlinks;

module.exports = relocateLoader;
