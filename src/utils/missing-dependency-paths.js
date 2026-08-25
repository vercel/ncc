const fs = require("graceful-fs");
const { basename, dirname, isAbsolute, join, resolve: pathResolve } = require("path");

const packageRequest = /^(@[^/]+\/[^/]+|[^/]+)(\/.*)?$/;
const schemeRequest = /^[a-zA-Z][a-zA-Z\d+\-.]*:/;

const getStats = (path, cache) => {
  if (!cache.has(path)) {
    let stats = null;
    try {
      stats = fs.statSync(path);
    } catch (e) {}
    cache.set(path, stats);
  }
  return cache.get(path);
};

const isDirectory = (path, cache) => {
  const stats = getStats(path, cache);
  return stats ? stats.isDirectory() : false;
};

// Watching a candidate only pays off up to its first missing segment: creating
// that segment invalidates the build, and the next build probes one level
// deeper. Registering the full path instead would make rspack watch the closest
// existing ancestor, which can be far enough up the tree to be recursive.
const firstMissingSegment = (path, cache) => {
  if (isDirectory(path, cache)) return null;
  let current = path;
  let parent = dirname(current);
  while (parent !== current) {
    if (isDirectory(parent, cache)) return current;
    current = parent;
    parent = dirname(current);
  }
  return null;
};

const lookupDirectories = context => {
  const directories = [];
  let current = context;
  let parent = dirname(current);
  while (true) {
    if (basename(current) !== "node_modules") directories.push(current);
    if (parent === current) return directories;
    current = parent;
    parent = dirname(current);
  }
};

const findPackageScope = (context, cache) => {
  const packageJsonCandidates = [];
  for (const directory of lookupDirectories(context)) {
    const packageJson = join(directory, "package.json");
    packageJsonCandidates.push(packageJson);
    try {
      const stats = getStats(packageJson, cache);
      if (stats && stats.isFile()) {
        return {
          directory,
          packageJson,
          packageJsonCandidates,
          data: JSON.parse(fs.readFileSync(packageJson, "utf8"))
        };
      }
    } catch (e) {}
  }
  return { packageJsonCandidates };
};

const moduleCandidates = (base, extensions) => {
  const candidates = [base, join(base, "package.json")];
  for (const extension of extensions)
    candidates.push(join(base, `index${extension}`));
  return candidates;
};

const fileCandidates = (base, extensions) => {
  const candidates = moduleCandidates(base, extensions);
  for (const extension of extensions) candidates.push(base + extension);
  return candidates;
};

const findMappings = (mapping, key) => {
  if (!mapping || typeof mapping !== "object" || Array.isArray(mapping)) {
    return key === "." ? [{ value: mapping, wildcard: "" }] : [];
  }
  if (Object.prototype.hasOwnProperty.call(mapping, key)) {
    return [{ value: mapping[key], wildcard: "" }];
  }
  const matches = [];
  for (const pattern of Object.keys(mapping)) {
    const star = pattern.indexOf("*");
    if (star === -1) continue;
    const prefix = pattern.slice(0, star);
    const suffix = pattern.slice(star + 1);
    if (!key.startsWith(prefix) || !key.endsWith(suffix)) continue;
    matches.push({
      value: mapping[pattern],
      wildcard: key.slice(prefix.length, key.length - suffix.length)
    });
  }
  if (matches.length) return matches;
  const isConditionalMap = !Object.keys(mapping).some(name =>
    name.startsWith(".") || name.startsWith("#")
  );
  return key === "." && isConditionalMap
    ? [{ value: mapping, wildcard: "" }]
    : [];
};

const bareTargetCandidates = (
  request,
  context,
  extensions,
  mainFields,
  seen = new Set()
) => {
  const seenKey = `bare\0${context}\0${request}`;
  if (seen.has(seenKey)) return [];
  seen.add(seenKey);
  const match = packageRequest.exec(request);
  if (!match) return [];
  const [, name, subpath] = match;
  const candidates = [];
  for (const directory of lookupDirectories(context)) {
    const packageDirectory = join(directory, "node_modules", name);
    const packageJson = join(packageDirectory, "package.json");
    candidates.push(...(subpath
      ? [packageJson, ...fileCandidates(join(packageDirectory, subpath), extensions)]
      : moduleCandidates(packageDirectory, extensions)));
    try {
      const data = JSON.parse(fs.readFileSync(packageJson, "utf8"));
      candidates.push(
        ...mappedTargetCandidates(
          data.exports,
          subpath ? `.${subpath}` : ".",
          packageDirectory,
          extensions,
          mainFields,
          seen
        )
      );
      if (!subpath) {
        for (const field of mainFields) {
          if (typeof data[field] === "string") {
            candidates.push(
              ...fileCandidates(pathResolve(packageDirectory, data[field]), extensions)
            );
          }
        }
      }
    } catch (e) {}
  }
  return candidates;
};

const mappedTargetCandidates = (
  mapping,
  key,
  packageDirectory,
  extensions,
  mainFields,
  seen = new Set()
) => {
  const seenKey = `mapping\0${packageDirectory}\0${key}`;
  if (seen.has(seenKey)) return [];
  seen.add(seenKey);
  const matches = findMappings(mapping, key);
  const targets = [];
  const addTargets = (value, wildcard) => {
    if (typeof value === "string") {
      const target = value.replace(/\*/g, wildcard);
      if (target.startsWith("./")) {
        targets.push(...fileCandidates(pathResolve(packageDirectory, target), extensions));
      } else if (!target.startsWith("#") && !schemeRequest.test(target)) {
        targets.push(
          ...bareTargetCandidates(
            target,
            packageDirectory,
            extensions,
            mainFields,
            seen
          )
        );
      }
    } else if (Array.isArray(value)) {
      value.forEach(item => addTargets(item, wildcard));
    } else if (value && typeof value === "object") {
      Object.values(value).forEach(item => addTargets(item, wildcard));
    }
  };
  matches.forEach(match => addTargets(match.value, match.wildcard));
  return targets;
};

// Rspack resolves in Rust and only reports the paths a resolver touched when the
// request resolves, so a miss arrives with no dependency information at all
// (see web-infra-dev/rspack#14640). ncc turns misses into runtime errors instead
// of build failures, which means nothing else records them either, so derive the
// paths whose creation could make the request resolve.
module.exports = function missingDependencyPaths(
  request,
  context,
  extensions,
  cache = new Map(),
  mainFields = ["main"]
) {
  const requestPath = request.startsWith("#")
    ? request.split("?", 1)[0]
    : request.split(/[?#]/, 1)[0];
  if (!requestPath) return [];

  let candidates;
  if (requestPath.startsWith(".") || isAbsolute(requestPath)) {
    candidates = fileCandidates(pathResolve(context, requestPath), extensions);
  } else if (requestPath.startsWith("#")) {
    const scope = findPackageScope(context, cache);
    candidates = scope.packageJson
      ? [
          scope.packageJson,
          ...mappedTargetCandidates(
            scope.data && scope.data.imports,
            requestPath,
            scope.directory,
            extensions,
            mainFields
          )
        ]
      : scope.packageJsonCandidates;
  } else if (schemeRequest.test(requestPath)) {
    return [];
  } else {
    candidates = bareTargetCandidates(
      requestPath,
      context,
      extensions,
      mainFields
    );
  }

  const paths = new Set();
  for (const candidate of candidates) {
    const missing = firstMissingSegment(candidate, cache);
    if (missing) paths.add(missing);
  }
  return [...paths];
};
