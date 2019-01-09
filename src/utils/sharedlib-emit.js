const os = require('os');
const fs = require('graceful-fs');
const glob = require('glob');

let sharedlibGlob;
switch (os.platform()) {
  case 'darwin':
    sharedlibGlob = '/**/*.dylib';
  break;
  case 'win32':
    sharedlibGlob = '/**/*.dll';
  break;
  default:
    sharedlibGlob = '/**/*.so?(.*)';
}

// helper for emitting the associated shared libraries when a binary is emitted
module.exports = async function (pkgPath, assetState, emitFile) {
  const files = await new Promise((resolve, reject) =>
    glob(pkgPath + sharedlibGlob, { ignore: 'node_modules/**/*' }, (err, files) => err ? reject(err) : resolve(files))
  );
  await Promise.all(files.map(async file => {
    const [source, permissions] = await Promise.all([
      new Promise((resolve, reject) =>
        fs.readFile(file, (err, source) => err ? reject(err) : resolve(source))
      ),
      await new Promise((resolve, reject) => 
        fs.stat(file, (err, stats) => err ? reject(err) : resolve(stats.mode))
      )
    ]);
    assetState.assetPermissions[file.substr(pkgPath.length)] = permissions;
    emitFile(file.substr(pkgPath.length), source);
  }));
};