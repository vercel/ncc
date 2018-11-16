const mysql = require("mysql");
module.exports = () => {
  var connection = mysql.createConnection({
    host: "localhost",
    user: "me",
    password: "secret",
    database: "my_db"
  });
};
