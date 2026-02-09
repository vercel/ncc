const relocateLoader = require('@vercel/webpack-asset-relocator-loader');

function ensureMainTemplate(compilation) {
  if (!compilation || compilation.mainTemplate) {
    return;
  }
  const requireExtensions = {
    taps: [],
    tap(_name, fn) {
      this.taps.push(fn);
    }
  };
  compilation.mainTemplate = {
    hooks: {
      requireExtensions
    }
  };
}

function wrappedRelocateLoader(content, map) {
  ensureMainTemplate(this._compilation);
  if (this.resourcePath && this.resourcePath.endsWith('.json') && content !== undefined && content !== null) {
    const callback = this.async();
    const result = typeof content === 'string' ? content : content.toString();
    if (callback) {
      callback(null, result, map);
      return;
    }
    return result;
  }
  if (content === undefined || content === null) {
    const callback = this.async();
    if (callback) {
      callback(null, content, map);
      return;
    }
    return content;
  }
  return relocateLoader.call(this, content, map);
}

wrappedRelocateLoader.raw = relocateLoader.raw;
wrappedRelocateLoader.getAssetMeta = relocateLoader.getAssetMeta;
wrappedRelocateLoader.getSymlinks = relocateLoader.getSymlinks;
wrappedRelocateLoader.initAssetCache = function initAssetCache(compilation, outputAssetBase) {
  ensureMainTemplate(compilation);
  return relocateLoader.initAssetCache(compilation, outputAssetBase);
};
wrappedRelocateLoader.initAssetMetaCache = wrappedRelocateLoader.initAssetCache;

module.exports = wrappedRelocateLoader;
