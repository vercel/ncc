const path = require("path");
const fs = require("fs");

// pregyp
const versioning = require("node-pre-gyp/lib/util/versioning.js");
const napi = require("node-pre-gyp/lib/util/napi.js");
const pregypFind = (package_json_path, opts) => {
  const package_json = JSON.parse(fs.readFileSync(package_json_path).toString());
  versioning.validate_config(package_json, opts);
  var napi_build_version;
  if (napi.get_napi_build_versions (package_json, opts)) {
    napi_build_version = napi.get_best_napi_build_version(package_json, opts);
  }
  opts = opts || {};
  if (!opts.module_root) opts.module_root = path.dirname(package_json_path);
  var meta = versioning.evaluate(package_json,opts,napi_build_version);
  return meta.module;
};
exports.pregyp = { default: { find: pregypFind }, find: pregypFind };

// nbind
// Adapted from nbind.js
function makeModulePathList(root, name) {
  return ([
    [root, name],
    [root, "build", name],
    [root, "build", "Debug", name],
    [root, "build", "Release", name],
    [root, "out", "Debug", name],
    [root, "Debug", name],
    [root, "out", "Release", name],
    [root, "Release", name],
    [root, "build", "default", name],
    [
        root,
        process.env["NODE_BINDINGS_COMPILED_DIR"] || "compiled",
        process.versions.node,
        process.platform,
        process.arch,
        name
    ]
  ]);
}
function findCompiledModule(basePath, specList) {
  var resolvedList = [];
  var ext = path.extname(basePath);
  for (var _i = 0, specList_1 = specList; _i < specList_1.length; _i++) {
    var spec = specList_1[_i];
    if (ext == spec.ext) {
      try {
        spec.path = eval("require.resolve(basePath)");
        return spec;
      }
      catch (err) {
        resolvedList.push(basePath);
      }
    }
  }
  for (var _a = 0, specList_2 = specList; _a < specList_2.length; _a++) {
    var spec = specList_2[_a];
    for (var _b = 0, _c = makeModulePathList(basePath, spec.name); _b < _c.length; _b++) {
      var pathParts = _c[_b];
      var resolvedPath = path.resolve.apply(path, pathParts);
      try {
        spec.path = eval("require.resolve(resolvedPath)");
      }
      catch (err) {
        resolvedList.push(resolvedPath);
        continue;
      }
      return spec;
    }
  }
  return null;
}
function find(basePath = process.cwd()) {
  return findCompiledModule(basePath, [
    { ext: ".node", name: "nbind.node", type: "node" },
    { ext: ".js", name: "nbind.js", type: "emcc" }
  ]);
}
exports.nbind = { default: { init: find, find }, init: find, find };

