const ts = require('typescript');
const { join, dirname, resolve } = require('path');
const fs = require('fs');
const { paramCase } = require('param-case');

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
 * @param {ts.CompilerOptions} options
 * @param {string | undefined} key
 * @param {(value: string) => string} [callback]
 * @returns {string | undefined}
 */
function convertEnumCompilerOptions(enumCompilerOptions, key, callback) {
  if (key == null) {
    return undefined;
  }
  const value = enumCompilerOptions[key];
  return typeof callback === 'function' ? callback(value) : value;
}

/**
 * @param {string} value
 * @returns {string}
 */
function toLowerCase(value) {
  return value.toLowerCase();
}

/**
 * @param {ts.NewLineKind} newLine
 * @returns {string | undefined}
 */
function normalizeNewLineOption(newLine) {
  switch (newLine) {
    case ts.NewLineKind.CarriageReturnLineFeed:
      return 'crlf';
    case ts.NewLineKind.LineFeed:
      return 'lf';
    default:
      return undefined;
  }
}

/**
 * @param {ts.ModuleResolutionKind} moduleResolution
 * @returns {string | undefined}
 */
function normalizeModuleResolutionOption(moduleResolution) {
  switch (moduleResolution) {
    case ts.ModuleResolutionKind.Classic:
      return 'classic';
    case ts.ModuleResolutionKind.NodeJs:
      return 'node';
    case ts.ModuleResolutionKind.Node12:
      return 'node12';
    case ts.ModuleResolutionKind.NodeNext:
      return 'nodenext';
    default:
      return undefined;
  }
}

/**
 * @param {ts.CompilerOptions} options
 * @returns {ts.CompilerOptions}
 */
function normalizeCompilerOptions(options) {
  if (options.importsNotUsedAsValues != null) {
    options.importsNotUsedAsValues = convertEnumCompilerOptions(
      ts.ImportsNotUsedAsValues,
      options.importsNotUsedAsValues,
      toLowerCase,
    );
  }
  if (options.jsx != null) {
    options.jsx = convertEnumCompilerOptions(ts.JsxEmit, options.jsx, paramCase);
  }
  if (options.module != null) {
    options.module = convertEnumCompilerOptions(ts.ModuleKind, options.module, toLowerCase);
  }
  if (options.moduleResolution != null) {
    options.moduleResolution = normalizeModuleResolutionOption(options.moduleResolution);
  }
  if (options.newLine != null) {
    options.newLine = normalizeNewLineOption(options.newLine);
  }
  if (options.target != null) {
    options.target = convertEnumCompilerOptions(ts.ScriptTarget, options.target, toLowerCase);
  }
  return options;
}

/**
 * @param {string | undefined} configPath
 * @param {LoadTsconfigInit}
 * @returns {ts.CompilerOptions}
 */
exports.loadTsconfigOptions = function (configPath, { base, start, filename }) {
  // throw error if `configPath` does not exist
  const tsconfig = configPath != null ? resolve(configPath) : walkParentDirs({ base, start, filename });
  if (tsconfig == null) {
    return {};
  }
  const content = ts.readConfigFile(tsconfig, ts.sys.readFile);
  if (content.error != null || content.config == null) {
    return {};
  }
  const { options } = ts.parseJsonConfigFileContent(content.config, ts.sys, dirname(tsconfig));
  return normalizeCompilerOptions(options);
};
