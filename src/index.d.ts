/// <reference types="node" />

declare namespace ncc {
  interface Asset {
    source: Buffer | string;
    permissions?: number;
  }

  interface BuildResult {
    code: string;
    map: string | undefined;
    assets: Record<string, Asset>;
    symlinks: Record<string, string>;
    stats: unknown;
  }

  interface WatchBuildResult extends Partial<BuildResult> {
    err?: Error | string;
  }

  interface Watcher {
    handler(callback: (result: WatchBuildResult) => void): void;
    rebuild(callback: () => void): void;
    close(): void;
  }

  type Externals =
    | string[]
    | Record<string, string>;

  interface Options {
    cache?: string | false;
    externals?: Externals;
    filterAssetBase?: string;
    minify?: boolean;
    sourceMap?: boolean;
    assetBuilds?: boolean;
    sourceMapBasePrefix?: string;
    sourceMapRegister?: boolean;
    watch?: boolean;
    license?: string;
    target?: string;
    v8cache?: boolean;
    quiet?: boolean;
    debugLog?: boolean;
    transpileOnly?: boolean;
    filename?: string;
    esm?: boolean;
    production?: boolean;
    mainFields?: string[];
    existingAssetNames?: string[];
    customEmit?: (
      path: string,
      outOrAsset?: boolean
    ) => void | false | string;
  }
}

declare function ncc(
  input: string,
  options?: ncc.Options & { watch?: false }
): Promise<ncc.BuildResult>;

declare function ncc(
  input: string,
  options: ncc.Options & { watch: true }
): ncc.Watcher;

declare function ncc(
  input: string,
  options?: ncc.Options
): Promise<ncc.BuildResult> | ncc.Watcher;

export = ncc;
