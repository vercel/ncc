const { join, dirname, resolve } = require('path');
const fs = require('fs');
const { parse } = require('tsconfck');

const DEFAULT_TSCONFIG_OPTIONS = {
  compilerOptions: {}
};

/**
 * @typedef {object} LoadTsconfigInit
 * @property {string} base
 * @property {string} start
 * @property {string} filename
 */

/**
 * @description Adapted from https://github.com/vercel/vercel/blob/18bec983aefbe2a77bd14eda6fca59ff7e956d8b/packages/build-utils/src/fs/run-user-scripts.ts#L289-L310
 * @param {LoadTsconfigInit}
 * @returns {string | null}
 */
function walkParentDirs({ base, start, filename }) {
  let parent = '';

  for (let current = start; base.length <= current.length; current = parent) {
    const fullPath = join(current, filename);

    if (fs.existsSync(fullPath)) {
      return fullPath;
    }

    parent = dirname(current);
  }

  return null;
}

/**
 * @param {string | undefined} configPath
 * @param {LoadTsconfigInit}
 * @returns {Promise<object>}
 */
exports.loadTsconfigOptions = async function (configPath, { base, start, filename }) {
  // throw error if `configPath` does not exist
  const tsconfig = configPath != null ? resolve(configPath) : walkParentDirs({ base, start, filename });
  if (tsconfig == null) {
    return DEFAULT_TSCONFIG_OPTIONS;
  }
  try {
    const result = await parse(tsconfig);
    return result.tsconfig;
  } catch (error) {
    console.error(error);
    throw error;
  }
};
