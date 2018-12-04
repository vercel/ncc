const os = require('os');
const path = require('path');
const fs = require('fs');

let libRegEx;
switch (os.platform()) {
  case 'darwin':
    libRegEx = /\.dylib$/;
  break;
  case 'win32':
    libRegEx = /\.dll$/;
  break;
  default:
    libRegEx = /\.so(\.\d+)?$/;
}

// helper for emitting the associated shared libraries when a binary is emitted
module.exports = function (binaryPath, emitFile) {
  const dir = path.dirname(binaryPath);
  const files = fs.readdirSync(dir);

  const sharedLibs = files.filter(name => name.match(libRegEx));
  sharedLibs.forEach(name => {
    const libPath = path.resolve(dir, name);
    emitFile(name, fs.readFileSync(libPath));
  });
};