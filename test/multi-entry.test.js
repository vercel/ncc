const ncc = global.coverage ? require("../src/index") : require("../");
const path = require('path');
const assert = require('assert');

jest.setTimeout(30000);

it('Should support multiple entry points', async () => {
  const { output } = await ncc({
    twilio: path.resolve('./test/integration/twilio.js'),
    leveldown: path.resolve('./test/integration/leveldown.js')
  });

  assert.strictEqual(Object.keys(output).length, 4);
});
