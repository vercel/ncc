const path = require("path");

function getCompiler(options) {
  if (options && options.compiler) {
    if (typeof options.compiler === "string") {
      return require(options.compiler);
    }
    return options.compiler;
  }
  return require("typescript");
}

function formatDiagnostics(typescript, diagnostics) {
  if (!diagnostics || !diagnostics.length) return null;
  const formatHost = {
    getCanonicalFileName: fileName => fileName,
    getCurrentDirectory: () => process.cwd(),
    getNewLine: () => typescript.sys.newLine || '\n'
  };
  if (typescript.formatDiagnostics) {
    return typescript.formatDiagnostics(diagnostics, formatHost);
  }
  return typescript.formatDiagnosticsWithColorAndContext
    ? typescript.formatDiagnosticsWithColorAndContext(diagnostics, formatHost)
    : null;
}

function dedupeDiagnostics(compilation, typescript, diagnostics) {
  if (!compilation || !diagnostics || diagnostics.length === 0) return diagnostics;
  if (!compilation.__nccTsLoaderDiagnostics) {
    compilation.__nccTsLoaderDiagnostics = new Set();
  }
  return diagnostics.filter(diagnostic => {
    const message = typescript.flattenDiagnosticMessageText
      ? typescript.flattenDiagnosticMessageText(diagnostic.messageText, "\n")
      : String(diagnostic.messageText);
    const fileName = diagnostic.file ? diagnostic.file.fileName : "";
    const key = [
      diagnostic.code,
      diagnostic.category,
      fileName,
      diagnostic.start,
      diagnostic.length,
      message
    ].join("\0");
    if (compilation.__nccTsLoaderDiagnostics.has(key)) return false;
    compilation.__nccTsLoaderDiagnostics.add(key);
    return true;
  });
}

function splitDiagnostics(typescript, diagnostics) {
  const errorCategory = typescript.DiagnosticCategory
    ? typescript.DiagnosticCategory.Error
    : 1;
  const errors = [];
  const warnings = [];
  for (const diagnostic of diagnostics || []) {
    (diagnostic.category === errorCategory ? errors : warnings).push(diagnostic);
  }
  return { errors, warnings };
}

function reportDiagnostics(typescript, diagnostics, emitError, emitWarning) {
  const { errors, warnings } = splitDiagnostics(typescript, diagnostics);
  const errorsText = formatDiagnostics(typescript, errors);
  if (errorsText) {
    emitError(new Error(errorsText));
  }
  const warningsText = formatDiagnostics(typescript, warnings);
  if (warningsText && emitWarning) {
    emitWarning(new Error(warningsText));
  }
}

function getTypeCheckState(loaderContext, typescript, parsedOptions) {
  const compilation = loaderContext._compilation;
  if (!compilation || !compilation.hooks || !compilation.hooks.finishModules || !compilation.errors) {
    return null;
  }
  const stateKey = JSON.stringify(parsedOptions);
  if (!compilation.__nccTsLoaderState) {
    compilation.__nccTsLoaderState = new Map();
  }
  if (compilation.__nccTsLoaderState.has(stateKey)) {
    return compilation.__nccTsLoaderState.get(stateKey);
  }
  const state = {
    files: new Set(),
    host: typescript.createCompilerHost(parsedOptions),
    program: null,
    emitDiagnostics: [],
    emitAsset: typeof compilation.emitAsset === "function"
      ? compilation.emitAsset.bind(compilation)
      : null
  };
  compilation.__nccTsLoaderState.set(stateKey, state);
  compilation.hooks.finishModules.tap("ncc-ts-loader", () => {
    const program = state.program;
    let diagnostics = state.emitDiagnostics.concat(
      typescript.getPreEmitDiagnostics(program)
    );
    if (
      state.emitAsset &&
      !parsedOptions.noEmit &&
      (parsedOptions.declaration || parsedOptions.composite)
    ) {
      const outputDirectory = parsedOptions.declarationDir || parsedOptions.outDir;
      const emitResult = program.emit(
        undefined,
        (outputPath, content) => {
          if (!/\.d\.(?:ts|mts|cts)(?:\.map)?$/.test(outputPath)) return;
          let assetName = outputDirectory
            ? path.relative(outputDirectory, outputPath)
            : path.basename(outputPath);
          if (assetName.startsWith("..") || path.isAbsolute(assetName)) {
            assetName = path.basename(outputPath);
          }
          state.emitAsset(assetName.split(path.sep).join("/"), {
            source: () => content,
            size: () => Buffer.byteLength(content)
          });
        },
        undefined,
        true
      );
      diagnostics = diagnostics.concat(emitResult.diagnostics || []);
    }
    diagnostics = dedupeDiagnostics(
      compilation,
      typescript,
      diagnostics
    );
    reportDiagnostics(
      typescript,
      diagnostics,
      error => compilation.errors.push(error),
      compilation.warnings
        ? warning => compilation.warnings.push(warning)
        : null
    );
  });
  return state;
}

module.exports = function tsTranspileLoader(input, inputSourceMap) {
  if (this.cacheable) this.cacheable();
  const callback = this.async();
  const options = this.getOptions ? this.getOptions() : this.query || {};
  if (options.configFilePath && this.addDependency) {
    this.addDependency(options.configFilePath);
  }
  const typescript = getCompiler(options);
  const compilerOptions = Object.assign({}, options.compilerOptions);
  if (compilerOptions.skipLibCheck === undefined) {
    compilerOptions.skipLibCheck = true;
  }
  if (this.sourceMap && compilerOptions.sourceMap !== false && compilerOptions.inlineSourceMap !== true) {
    compilerOptions.sourceMap = true;
  }
  const fileName = this.resourcePath;
  if (!fileName.endsWith('.ts') && !fileName.endsWith('.tsx')) {
    callback(null, input, inputSourceMap);
    return;
  }
  const configFileDirectory = options.configFileDirectory || path.dirname(fileName);
  const parsedConfig = typescript.convertCompilerOptionsFromJson
    ? typescript.convertCompilerOptionsFromJson(compilerOptions, configFileDirectory)
    : { options: compilerOptions, errors: [] };
  const parsedOptions = parsedConfig.options || compilerOptions;
  let outputText;
  let sourceMapText;
  let diagnostics = parsedConfig.errors || [];
  const typeCheckState = options.transpileOnly
    ? null
    : getTypeCheckState(this, typescript, parsedOptions);

  if (typeCheckState) {
    typeCheckState.files.add(fileName);
    if (
      !typeCheckState.program ||
      !typeCheckState.program.getSourceFile(fileName)
    ) {
      typeCheckState.program = typescript.createProgram(
        Array.from(typeCheckState.files),
        parsedOptions,
        typeCheckState.host,
        typeCheckState.program || undefined
      );
    }
    const sourceFile = typeCheckState.program.getSourceFile(fileName);
    const emitResult = typeCheckState.program.emit(
      sourceFile,
      (outputPath, content) => {
        if (/\.d\.(?:ts|mts|cts)(?:\.map)?$/.test(outputPath)) {
          return;
        }
        if (outputPath.endsWith(".map")) {
          sourceMapText = content;
        } else {
          outputText = content;
        }
      }
    );
    typeCheckState.emitDiagnostics.push(...(emitResult.diagnostics || []));
  } else {
    const result = typescript.transpileModule(input.toString(), {
      fileName,
      compilerOptions: parsedOptions,
      reportDiagnostics: true
    });
    outputText = result.outputText;
    sourceMapText = result.sourceMapText;
    diagnostics = diagnostics.concat(result.diagnostics || []);
  }

  if (!options.transpileOnly && !typeCheckState) {
    const host = typescript.createCompilerHost(parsedOptions);
    const program = typescript.createProgram([fileName], parsedOptions, host);
    diagnostics = diagnostics.concat(typescript.getPreEmitDiagnostics(program));
  }

  diagnostics = dedupeDiagnostics(this._compilation, typescript, diagnostics);
  reportDiagnostics(
    typescript,
    diagnostics,
    error => this.emitError(error),
    this.emitWarning ? warning => this.emitWarning(warning) : null
  );

  let map = inputSourceMap;
  if (sourceMapText) {
    map = JSON.parse(sourceMapText);
    map.file = path.basename(fileName);
    map.sources = [fileName];
    map.sourcesContent = [input.toString()];
  }

  callback(null, outputText, map);
};
