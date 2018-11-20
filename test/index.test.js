const fs = require("fs");
const ncc = require("../");

for (const integrationTest of fs.readdirSync(__dirname + "/integration")) {
  it(`should evaluate ${integrationTest} without errors`, async () => {
    const code = await ncc(__dirname + "/integration/" + integrationTest);
    module.exports = null;
    eval(code);
    if ("function" !== typeof module.exports) {
      throw new Error(`Integration test "${integrationTest}" evaluation failed. It does not export a function`)
    }
    await module.exports();
  })
}
