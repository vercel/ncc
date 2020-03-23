const { unlinkSync, readFileSync, writeFileSync } = require('fs');
const { join } = require('path');

const pkgJson = readFileSync(join(__dirname, 'package.json'), 'utf8');
const pkg = JSON.parse(pkgJson);
const isWin = process.platform === 'win32';
const isNode12 = process.version.startsWith('v12.');

if (isWin || isNode12) {
  unlinkSync(join(__dirname, 'yarn.lock'));
  // Delete the integration tests that fail in both Windows and Node12
  unlinkSync(join(__dirname, 'test', 'integration', 'yoga-layout.js'));
  delete pkg.devDependencies['yoga-layout'];
}

if (isWin) {
  // Delete the integration tests that will never work in Windows
  unlinkSync(join(__dirname, 'test', 'integration', 'tensorflow.js'));
  unlinkSync(join(__dirname, 'test', 'integration', 'highlights.js'));
  unlinkSync(join(__dirname, 'test', 'integration', 'hot-shots.js'));
  unlinkSync(join(__dirname, 'test', 'integration', 'loopback.js'));
  delete pkg.devDependencies['@tensorflow/tfjs-node'];
  delete pkg.devDependencies['highlights'];
  delete pkg.devDependencies['hot-shots'];
}

if (isNode12) {
  // Delete the integration tests that do not currently work with Node 12.x
  unlinkSync(join(__dirname, 'test', 'integration', 'oracledb.js'));
  unlinkSync(join(__dirname, 'test', 'integration', 'leveldown.js'));
  unlinkSync(join(__dirname, 'test', 'integration', 'sharp.js'));
  delete pkg.devDependencies['oracledb'];
  delete pkg.devDependencies['leveldown'];
  delete pkg.devDependencies['sharp'];
}

writeFileSync(join(__dirname, 'package.json'), JSON.stringify(pkg, null, ' '));
