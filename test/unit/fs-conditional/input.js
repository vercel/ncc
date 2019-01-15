const fs = require('fs');
if (fs.existsSync(__dirname + '/input1.js'))
  require('./input1.js');
else if (fs.existsSync(__dirname + '/input.js'))
  require('./input.js');
