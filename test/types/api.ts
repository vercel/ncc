import ncc = require("@vercel/ncc");

async function buildOnce() {
  const result = await ncc("./input.js", {
    cache: false,
    minify: true,
    sourceMap: true,
    assetBuilds: true,
    externals: ["express"],
    filterAssetBase: process.cwd(),
    sourceMapBasePrefix: "../",
    sourceMapRegister: true,
    license: "LICENSES.txt",
    target: "es2015",
    v8cache: false,
    quiet: true,
    debugLog: false,
    transpileOnly: true,
    filename: "index.js",
    esm: false,
    production: true,
    mainFields: ["main"],
    customEmit(path) {
      if (path.endsWith(".json")) return false;
    }
  });

  const code: string = result.code;
  const map: string | undefined = result.map;
  const assets: ncc.Asset = result.assets["asset.bin"] || { source: "" };
  const source: Buffer | string = assets.source;
  const perms: number | undefined = assets.permissions;
  const symlink: string | undefined = result.symlinks["link"];
  const stats: unknown = result.stats;

  return { code, map, source, perms, symlink, stats };
}

function buildWatch() {
  const watcher = ncc("./input.js", { watch: true, quiet: true });

  watcher.handler(({ err, code, map, assets, symlinks, stats }) => {
    if (err) return;
    if (code) {
      void code.length;
    }
    void map;
    void assets;
    void symlinks;
    void stats;
  });

  watcher.rebuild(() => {});
  watcher.close();
}

async function mappedExternals() {
  await ncc("./input.js", {
    externals: {
      lodash: "lodash",
      "/^react($|\\/)/": "react"
    }
  });
}

void buildOnce();
void buildWatch();
void mappedExternals();
