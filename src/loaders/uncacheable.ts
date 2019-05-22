type Context = import('webpack').loader.LoaderContext;

module.exports = function (this: Context, input: string, map: any) {
  this.cacheable(false);
  return this.callback(null, input, map);
};