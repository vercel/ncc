const { say } = require("cowsay/build/cowsay.umd.js");

const nate = say({ text: "nate" });
if (!(nate.indexOf("nate") > 0)) {
  throw new Error('cowsay did not work. String "nate" not found in: ' + nate);
}

