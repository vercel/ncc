import path from 'path';

const file = path.resolve(__dirname, './pi-bridge.js');

const obscureRequire = eval(`function obscureRequire (file) {
    require(file);
}`);

console.log(obscureRequire(file));
