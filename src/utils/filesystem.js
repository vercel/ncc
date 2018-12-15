const fs = require('fs')

function stat(path) {
  return new Promise((resolve, reject) => {
    fs.stat(path, err => {
      if(!err) {
        return resolve(true)
      }

      if (err.code && err.code === 'ENOENT'){
        return resolve(false)
      }

      return reject(err)
    })
  })
}

module.exports = { stat }