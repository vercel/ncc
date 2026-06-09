const crypto = require("crypto");
const os = require("os");
const path = require("path");

const cacheBase = process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache");
const projectKey = crypto.hash("sha1", process.cwd());

module.exports = path.join(cacheBase, "ncc", projectKey);