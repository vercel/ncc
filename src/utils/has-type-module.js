const { resolve } = require('path');
const { readFileSync } = require('fs');

exports.hasTypeModule = function hasTypeModule (path) {
  while (path !== (path = resolve(path, '..'))) {
    try {
      return JSON.parse(readFileSync(eval('resolve')(path, 'package.json')).toString()).type === 'module';
    }
    catch (e) {
      if (e.code === 'ENOENT')
        continue;
      throw e;
    }
  }
}
