const path = require("path");

// Every node_modules directory between a starting directory and its filesystem
// root, nearest first, excluding the root itself.
//
// Comparing a directory against its own parent is the only stop condition that
// holds on every platform. `resolve("/node_modules")` does not: on Windows it
// resolves against the drive of the current working directory, so walking up
// from a directory on another drive reaches that drive's root and stays there.
module.exports = function nodeModulesCandidates (start, { dirname, join } = path) {
  const candidates = [];
  let current = start;
  let parent = dirname(current);
  while (parent !== current) {
    candidates.push(join(current, "node_modules"));
    current = parent;
    parent = dirname(current);
  }
  return candidates;
};
