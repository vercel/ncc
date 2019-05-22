// returns the base-level package folder based on detecting "node_modules"
// package name boundaries
import { getPackageBase } from '../utils/get-package-base';
type Context = import('webpack').loader.LoaderContext;

const emptyModules = { 'uglify-js': true };

module.exports = function (this: Context, input: string, map: any) {
  const id = this.resourcePath;
  const pkgBase = getPackageBase(id);
  if (pkgBase) {
    const baseParts = pkgBase.split('/');
    if (baseParts[baseParts.length - 2] === 'node_modules') {
      const pkgName = baseParts[baseParts.length - 1];
      if (pkgName in emptyModules) {
        console.error(`ncc: Ignoring build of ${pkgName}, as it is not statically analyzable. Build with "--external ${pkgName}" if this package is needed.`);
        return '';
      }
    }
  }
  this.callback(null, input, map);
  return undefined;
};
