const Memcached = require('memcached');
module.exports = () => {
  Memcached.config.poolSize = 25;
}
