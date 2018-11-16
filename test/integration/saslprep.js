const saslprep = require("saslprep");

module.exports = () => {
  saslprep("password\u00AD");
};
