const path = require("path");

module.exports = function (assetName, assetPath, assetNames) {
  const ext = path.extname(assetName);
  let uniqueName = assetName, i = 0;
  while (uniqueName in assetNames && assetNames[uniqueName] !== assetPath)
    uniqueName = assetName.substr(0, assetName.length - ext.length) + ++i + ext;
  assetNames[uniqueName] = assetPath;
  return uniqueName;
};