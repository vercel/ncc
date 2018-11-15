const aws = require('aws-sdk');

module.exports = () => {
  new aws.S3();
}
