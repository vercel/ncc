const assert = require('assert');
const childProcess = require('child_process');
const path = require('path');

(function main() {
  if (process.env.CHILD !== 'notfound-eval') {
    const cp = childProcess.fork(__filename, [], {
      stdio: 'inherit',
      env: Object.assign({}, process.env, {
        CHILD: 'notfound-eval',
        NODE_PATH: path.join(process.cwd(), 'test/integration/node-path')
      })
    });
    cp.on('exit', (code) => {
      if (code == null) {
        code = 1;
      }
      process.exit(code);
    })
    return;
  }
  const foo = require('foo');
  assert.strictEqual(foo, 'foo');
})();
