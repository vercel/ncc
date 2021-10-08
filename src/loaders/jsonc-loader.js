const jsonc = require('jsonc')

module.exports =  (source) => {
  const parseSource=jsonc.parse(source)
  const stringifySource= JSON.stringify(parseSource)

  return `module.exports=${stringifySource}`
}


