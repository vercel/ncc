const relocateLoader = require('@vercel/webpack-asset-relocator-loader');
const fs = require('fs');

function wrappedRelocateLoader(content, map) {
  if (this.resourcePath && this.resourcePath.endsWith('.node')) {
    try {
      const fileBuffer = fs.readFileSync(this.resourcePath);
      if (!Buffer.isBuffer(content) || content.length !== fileBuffer.length) {
        content = fileBuffer;
      }
    } catch (e) {
      // keep original content on read failure
    }
  }
  if (content === undefined || content === null) {
    const callback = this.async();
    if (callback) {
      callback(null, content, map);
      return;
    }
    return content;
  }
  const context = Object.create(this);
  context.emitFile = (...args) => {
    // Rspack's persistent cache cannot restore the relocator's JS metadata and name allocator.
    this.cacheable(false);
    this.emitFile(...args);
  };
  context.callback = (...args) => {
    // Symlinks are compilation side effects, not emitted assets that Rspack caches.
    if (Object.keys(relocateLoader.getSymlinks(this._compilation)).length) {
      this.cacheable(false);
    }
    this.callback(...args);
  };
  return relocateLoader.call(context, content, map);
}

wrappedRelocateLoader.raw = relocateLoader.raw;
wrappedRelocateLoader.getAssetMeta = relocateLoader.getAssetMeta;
wrappedRelocateLoader.getSymlinks = relocateLoader.getSymlinks;
wrappedRelocateLoader.initAssetCache = function initAssetCache(compilation, outputAssetBase) {
  return relocateLoader.initAssetCache(compilation, outputAssetBase);
};
wrappedRelocateLoader.initAssetMetaCache = wrappedRelocateLoader.initAssetCache;

module.exports = wrappedRelocateLoader;
