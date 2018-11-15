const ManagementClient = require("auth0").ManagementClient;
module.exports = () => {
  try {
    new ManagementClient();
  } catch (err) {
    if (!/Management API SDK options must be an object/.test(err.message)) {
      throw err;
    }
  }
};
