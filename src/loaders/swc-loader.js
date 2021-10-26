// Source code from https://github.com/swc-project/swc-loader/blob/master/src/index.js
// with the following changes:
// - swapped out `@swc/core` for `@swc/wasm`
// - swapped out `swc.transform()` for `swc.transformSync()`

const loaderUtils = require("loader-utils");
const swc = require("@swc/wasm");

function makeLoader() {
    return function (source, inputSourceMap) {
        // Make the loader async
        const callback = this.async();
        const filename = this.resourcePath;

        let loaderOptions = loaderUtils.getOptions(this) || {};

        // Standardize on 'sourceMaps' as the key passed through to Webpack, so that
        // users may safely use either one alongside our default use of
        // 'this.sourceMap' below without getting error about conflicting aliases.
        if (
            Object.prototype.hasOwnProperty.call(loaderOptions, "sourceMap") &&
            !Object.prototype.hasOwnProperty.call(loaderOptions, "sourceMaps")
        ) {
            loaderOptions = Object.assign({}, loaderOptions, {
                sourceMaps: loaderOptions.sourceMap,
            });
            delete loaderOptions.sourceMap;
        }

        if (inputSourceMap) {
            inputSourceMap = JSON.stringify(inputSourceMap);
        }

        const programmaticOptions = Object.assign({}, loaderOptions, {
            filename,
            inputSourceMap: inputSourceMap || undefined,

            // Set the default sourcemap behavior based on Webpack's mapping flag,
            // but allow users to override if they want.
            sourceMaps:
                loaderOptions.sourceMaps === undefined
                    ? this.sourceMap
                    : loaderOptions.sourceMaps,

            // Ensure that Webpack will get a full absolute path in the sourcemap
            // so that it can properly map the module back to its internal cached
            // modules.
            sourceFileName: filename,
        });
        if (!programmaticOptions.inputSourceMap) {
            delete programmaticOptions.inputSourceMap;
        }

        const parseMap = programmaticOptions.parseMap;

        delete programmaticOptions.parseMap;
        delete programmaticOptions.customize;
        delete programmaticOptions.cacheDirectory;
        delete programmaticOptions.cacheIdentifier;
        delete programmaticOptions.cacheCompression;
        delete programmaticOptions.metadataSubscribers;

        // auto detect development mode
        if (this.mode && programmaticOptions.jsc && programmaticOptions.jsc.transform 
            && programmaticOptions.jsc.transform.react && 
            !Object.prototype.hasOwnProperty.call(programmaticOptions.jsc.transform.react, "development")) {
                programmaticOptions.jsc.transform.react.development = this.mode === 'development'
        }

        if (programmaticOptions.sourceMaps === "inline") {
            // Babel has this weird behavior where if you set "inline", we
            // inline the sourcemap, and set 'result.map = null'. This results
            // in bad behavior from Babel since the maps get put into the code,
            // which Webpack does not expect, and because the map we return to
            // Webpack is null, which is also bad. To avoid that, we override the
            // behavior here so "inline" just behaves like 'true'.
            programmaticOptions.sourceMaps = true;
        }

        try {
            const output = swc.transformSync(source, programmaticOptions);
            callback(
                null,
                output.code,
                parseMap ? JSON.parse(output.map) : output.map
            );
        } catch (e) {
            callback(e);
        }
    };
}

module.exports = makeLoader();
module.exports.custom = makeLoader;
