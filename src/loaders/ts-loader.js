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

module.exports = function tsTranspileLoader(input, inputSourceMap) {
  if (this.cacheable) this.cacheable();
  const callback = this.async();
  const options = this.getOptions ? this.getOptions() : this.query || {};
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
  const parsedConfig = typescript.convertCompilerOptionsFromJson
    ? typescript.convertCompilerOptionsFromJson(compilerOptions, path.dirname(fileName))
    : { options: compilerOptions, errors: [] };
  const parsedOptions = parsedConfig.options || compilerOptions;
  const configDiagnosticsText = formatDiagnostics(typescript, parsedConfig.errors || []);
  if (configDiagnosticsText) {
    this.emitError(new Error(configDiagnosticsText));
  }
  let outputText;
  let sourceMapText;
  let diagnostics = [];

  if (options.transpileOnly) {
    const result = typescript.transpileModule(input.toString(), {
      fileName,
      compilerOptions: parsedOptions,
      reportDiagnostics: false
    });
    outputText = result.outputText;
    sourceMapText = result.sourceMapText;
    diagnostics = result.diagnostics || [];
  } else {
    const host = typescript.createCompilerHost(parsedOptions);
    host.writeFile = (writtenFileName, content) => {
      if (writtenFileName.endsWith('.map')) {
        sourceMapText = content;
        return;
      }
      if (writtenFileName.endsWith('.d.ts')) {
        return;
      }
      outputText = content;
    };
    const program = typescript.createProgram([fileName], parsedOptions, host);
    diagnostics = typescript.getPreEmitDiagnostics(program);
    const emitResult = program.emit();
    if (emitResult && emitResult.diagnostics) {
      diagnostics = diagnostics.concat(emitResult.diagnostics);
    }
  }

  const diagnosticsText = formatDiagnostics(typescript, diagnostics);
  if (diagnosticsText) {
    this.emitError(new Error(diagnosticsText));
  }

  let map = inputSourceMap;
  if (sourceMapText) {
    map = JSON.parse(sourceMapText);
    map.file = path.basename(fileName);
    map.sources = [fileName];
    map.sourcesContent = [input.toString()];
  }

  callback(null, outputText, map);
};
