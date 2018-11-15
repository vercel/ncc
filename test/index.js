const assert = require("assert");
const fs = require("fs");
const ncc = require("../");

(async () => {
  // unit
  //for (const unit of fs.readdirSync(__dirname + "/unit")) {
  //let actual, expected;
  //try {
  //expected = fs
  //.readFileSync(__dirname + "/unit/" + unit + "/output.js")
  //.toString()
  //.trim();
  //await ncc(__dirname + "/unit/" + unit + "/input.js", {
  //minify: false
  //}).then(async t => {
  //actual = t.code.trim();
  //assert.equal(actual, expected);
  //});
  //} catch (e) {
  //console.error(`Unit test ${unit} failed.`);
  //if (expected) console.error("Expected output:\n" + expected);
  //if (actual) console.error("\nGot output:\n" + actual);
  //console.error(e);
  //return;
  //}
  //}

  for (const test of fs.readdirSync(__dirname + "/integration")) {
    const code = await ncc(__dirname + "/integration/" + test);
    try {
      module.exports = null;
      eval(code);
      if ("function" !== typeof module.exports) {
        console.error(
          `Integration test "${test}" evaluation failed. It does not export a function`
        );
        continue;
      }
      await module.exports();
    } catch (err) {
      console.error(`Integration test "${test}" execution failed`, err);
    }
  }
})();
