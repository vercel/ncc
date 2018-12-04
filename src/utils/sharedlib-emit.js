const os = require('os');
const path = require('path');
const fs = require('fs');

// helper for emitting the associated shared libraries when a binary is emitted
module.exports = function (binaryPath, emitFile) {
  const dir = path.dirname(binaryPath);
  const files = fs.readdirSync(dir);
  let libExt;
  switch (os.platform()) {
    case 'darwin':
      libExt = '.dylib';
    break;
    case 'win32':
      libExt = '.dll';
    break;
    default:
      libExt = '.so';
  }
  const sharedLibs = files.filter(name => name.endsWith(libExt));
  sharedLibs.forEach(name => {
    const libPath = path.resolve(dir, name);
    emitFile(name, fs.readFileSync(libPath));
  });
};