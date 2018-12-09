// we re-export so that we generate a unique
// optional bundle for the ts-loader, that
// doesn't get loaded unless the user is
// compiling typescript
const { getOptions } = require("loader-utils");
const loader = require("ts-loader");
const tsId = require.resolve("typescript");
module.exports = function () {
  const options = getOptions(this);
  if (!options.compiler)
    options.compiler = tsId;
  return loader.apply(this, arguments);
};
