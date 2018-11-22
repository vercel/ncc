const fs = require("fs");
const ncc = require("../");

// the twilio test can take a while (large codebase)
jest.setTimeout(30000);

for (const integrationTest of fs.readdirSync(__dirname + "/integration")) {
  // ignore e.g.: `.json` files
  if (!integrationTest.endsWith(".js")) continue;
  it(`should evaluate ${integrationTest} without errors`, async () => {
    const { code, assets } = await ncc(__dirname + "/integration/" + integrationTest);
    module.exports = null;
    eval(code);
    if ("function" !== typeof module.exports) {
      throw new Error(
        `Integration test "${integrationTest}" evaluation failed. It does not export a function`
      );
    }
    await module.exports();
  });
}
