const leveldown = require('leveldown');
module.exports = () => {
  db = leveldown('tmp/db');
};