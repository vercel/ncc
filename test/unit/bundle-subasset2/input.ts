import Piscina from 'piscina';
import * as path from 'path';

const piscina = new Piscina({
  filename: path.resolve(__dirname, './pi-bridge.js'),
});

(async function() {
  const result = await piscina.runTask(2);
  console.log(result);
})();
