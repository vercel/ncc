const crypto = require("crypto");
const os = require("os");
const path = require("path");

const cacheBase = process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache");
const projectKey = crypto.createHash("sha256").update(process.cwd()).digest("hex").slice(0, 12);

module.exports = path.join(cacheBase, "ncc", projectKey);