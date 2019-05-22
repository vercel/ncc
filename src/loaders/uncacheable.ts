type LoaderContext = import('webpack').loader.LoaderContext;

module.exports = function (this: LoaderContext, input: string, map: any) {
  this.cacheable(false);
  return this.callback(null, input, map);
};