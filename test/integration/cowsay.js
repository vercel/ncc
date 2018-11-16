const { say } = require("cowsay");
module.exports = () => {
  const nate = say({ text: "nate" });
  if (!(nate.indexOf("nate") > 0)) {
    throw new Error('cowsay did not work. String "nate" not found in: ' + nate);
  }
};
