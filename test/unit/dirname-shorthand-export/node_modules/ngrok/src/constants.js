const { join } = require("path");
const platform = require("os").platform();

const defaultDir = join(__dirname, "..", "bin");
const bin = platform === "win32" ? "ngrok.exe" : "ngrok";
const ready = /starting web service.*addr=(\d+\.\d+\.\d+\.\d+:\d+)/;
const inUse = /address already in use/;

module.exports = {
  defaultDir,
  bin,
  ready,
  inUse,
};
