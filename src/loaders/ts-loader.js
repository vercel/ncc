// we re-export so that we generate a unique
// optional bundle for the ts-loader, that
// doesn't get loaded unless the user is
// compiling typescript
const logger = require("ts-loader/dist/logger");
const makeLogger = logger.makeLogger;
logger.makeLogger = function (loaderOptions, colors) {
  const instance = makeLogger(loaderOptions, colors);
  const logWarning = instance.logWarning;
  instance.logWarning = function (message) {
    // Disable TS Loader TypeScript compatibility warning
    if (message.indexOf('This version may or may not be compatible with ts-loader') !== -1)
      return;
    return logWarning(message);
  };
  return instance;
};

module.exports = require("ts-loader");

// ts-loader internally has a require("typescript") that applies
// regardless of "compiler".
// We could remap this too, as soon as ncc supports aliased externals
module.exports.typescript = require("typescript");
