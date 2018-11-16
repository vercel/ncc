const redis = require('redis');

module.exports = () => {
  redis.add_command('test');
}
