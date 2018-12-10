// we re-export so that we generate a unique
// optional bundle for the ts-loader, that
// doesn't get loaded unless the user is
// compiling typescript
const { getOptions } = require("loader-utils");
const loader = require("ts-loader");
const tsId = require.resolve("typescript");
module.exports = function () {
  let first = true;
  const options = getOptions(this);
  if (!options.compiler)
    Object.defineProperty(options, 'compiler', {
      get () {
        // hack to disable the warning when "compiler !== 'typescript'" while
        // still supporting numeric id on first access for require call
        return first ? (first = false, tsId) : 'typescript';
      }
    });
  return loader.apply(this, arguments);
};
