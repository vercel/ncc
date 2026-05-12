const ManagementClient = require("auth0").ManagementClient;

new ManagementClient({
  domain: "example.auth0.com",
  token: "token"
});

