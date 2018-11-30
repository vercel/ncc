const path = require("path");

module.exports = function (assetPath, assetNames) {
  const basename = path.basename(assetPath);
  const ext = path.extname(basename);
  let name = basename, i = 0;
  while (name in assetNames && assetNames[name] !== assetPath)
    name = basename.substr(0, basename.length - ext.length) + ++i + ext;
  assetNames[name] = assetPath;
  return name;
};