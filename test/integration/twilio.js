const twilio = require("twilio");
module.exports = () => {
  try {
    twilio();
  } catch (err) {
    if (!/username is required/.test(err.message)) {
      throw err;
    }
  }
};
