/**
 * This webpack resolver is largely from Next.js
 * https://github.com/vercel/next.js/blob/29ab433222adc879e7ccaa23b29bed674e123ec4/packages/next/build/webpack/plugins/jsconfig-paths-plugin.ts#L1
 */
const path = require('path')
 
const asterisk = 0x2a
 
function hasZeroOrOneAsteriskCharacter(str) {
  let seenAsterisk = false
  for (let i = 0; i < str.length; i++) {
    if (str.charCodeAt(i) === asterisk) {
      if (!seenAsterisk) {
        seenAsterisk = true
      } else {
        // have already seen asterisk
        return false
      }
    }
  }
  return true
}
 
/**
 * Determines whether a path starts with a relative path component (i.e. `.` or `..`).
 */
function pathIsRelative(testPath) {
  return /^\.\.?($|[\\/])/.test(testPath)
}
 
function tryParsePattern(pattern) {
  // This should be verified outside of here and a proper error thrown.
  const indexOfStar = pattern.indexOf('*')
  return indexOfStar === -1
    ? undefined
    : {
        prefix: pattern.substr(0, indexOfStar),
        suffix: pattern.substr(indexOfStar + 1),
      }
 }
 
function isPatternMatch({ prefix, suffix }, candidate) {
  return (
    candidate.length >= prefix.length + suffix.length &&
    candidate.startsWith(prefix) &&
    candidate.endsWith(suffix)
  )
}
 
/** Return the object corresponding to the best pattern to match `candidate`. */
function findBestPatternMatch(
  values,
  getPattern,
  candidate
) {
  let matchedValue
  // use length of prefix as betterness criteria
  let longestMatchPrefixLength = -1

  for (const v of values) {
    const pattern = getPattern(v)
    if (
      isPatternMatch(pattern, candidate) &&
      pattern.prefix.length > longestMatchPrefixLength
    ) {
      longestMatchPrefixLength = pattern.prefix.length
      matchedValue = v
    }
  }

  return matchedValue
}

/**
* patternStrings contains both pattern strings (containing "*") and regular strings.
* Return an exact match if possible, or a pattern match, or undefined.
* (These are verified by verifyCompilerOptions to have 0 or 1 "*" characters.)
*/
function matchPatternOrExact(
  patternStrings,
  candidate
) {
  const patterns = []
  for (const patternString of patternStrings) {
    if (!hasZeroOrOneAsteriskCharacter(patternString)) continue
    const pattern = tryParsePattern(patternString)
    if (pattern) {
      patterns.push(pattern)
    } else if (patternString === candidate) {
      // pattern was matched as is - no need to search further
      return patternString
    }
  }

  return findBestPatternMatch(patterns, (_) => _, candidate)
}

/**
* Tests whether a value is string
*/
function isString(text) {
  return typeof text === 'string'
}

/**
* Given that candidate matches pattern, returns the text matching the '*'.
* E.g.: matchedText(tryParsePattern("foo*baz"), "foobarbaz") === "bar"
*/
function matchedText(pattern, candidate) {
  return candidate.substring(
    pattern.prefix.length,
    candidate.length - pattern.suffix.length
  )
}

function patternText({ prefix, suffix }) {
  return `${prefix}*${suffix}`
}

const NODE_MODULES_REGEX = /node_modules/

class JsConfigPathsPlugin {
  constructor(paths, resolvedBaseUrl) {
    this.paths = paths
    this.resolvedBaseUrl = resolvedBaseUrl
    console.log('tsconfig.json or jsconfig.json paths: %O', paths)
    console.log('resolved baseUrl: %s', resolvedBaseUrl)
  }
  apply(resolver) {
    const paths = this.paths
    const pathsKeys = Object.keys(paths)

    // If no aliases are added bail out
    if (pathsKeys.length === 0) {
      console.log('paths are empty, bailing out')
      return
    }

    const baseDirectory = this.resolvedBaseUrl
    const target = resolver.ensureHook('resolve')
    resolver
      .getHook('described-resolve')
      .tapPromise(
        'JsConfigPathsPlugin',
        async (request, resolveContext) => {
          const moduleName = request.request

          // Exclude node_modules from paths support (speeds up resolving)
          if (request.path.match(NODE_MODULES_REGEX)) {
            console.log('skipping request as it is inside node_modules %s', moduleName)
            return
          }

          if (
            path.posix.isAbsolute(moduleName) ||
            (process.platform === 'win32' && path.win32.isAbsolute(moduleName))
          ) {
            console.log('skipping request as it is an absolute path %s', moduleName)
            return
          }

          if (pathIsRelative(moduleName)) {
            console.log('skipping request as it is a relative path %s', moduleName)
            return
          }

          // console.log('starting to resolve request %s', moduleName)

          // If the module name does not match any of the patterns in `paths` we hand off resolving to webpack
          const matchedPattern = matchPatternOrExact(pathsKeys, moduleName)
          if (!matchedPattern) {
            console.log('moduleName did not match any paths pattern %s', moduleName)
            return
          }

          const matchedStar = isString(matchedPattern)
            ? undefined
            : matchedText(matchedPattern, moduleName)
          const matchedPatternText = isString(matchedPattern)
            ? matchedPattern
            : patternText(matchedPattern)

          let triedPaths = []

          for (const subst of paths[matchedPatternText]) {
            const curPath = matchedStar
              ? subst.replace('*', matchedStar)
              : subst

            // Ensure .d.ts is not matched
            if (curPath.endsWith('.d.ts')) {
              continue
            }

            const candidate = path.join(baseDirectory, curPath)
            const [err, result] = await new Promise((resolve) => {
              const obj = Object.assign({}, request, {
                request: candidate,
              })
              resolver.doResolve(
                target,
                obj,
                `Aliased with tsconfig.json or jsconfig.json ${matchedPatternText} to ${candidate}`,
                resolveContext,
                (resolverErr, resolverResult) => {
                  resolve([resolverErr, resolverResult])
                }
              )
            })

            // There's multiple paths values possible, so we first have to iterate them all first before throwing an error
            if (err || result === undefined) {
              triedPaths.push(candidate)
              continue
            }

            return result
          }
        }
      )
  }
}

module.exports = {
  JsConfigPathsPlugin
}