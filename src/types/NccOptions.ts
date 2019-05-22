import webpack = require("webpack");

export interface NccOptions {
    cache?: boolean | string;
    externals?: string[];
    filename?: string;
    minify?: boolean;
    sourceMap?: boolean;
    sourceMapRegister?: boolean;
    sourceMapBasePrefix?: string;
    watch?: boolean | NccWatchObject;
    v8cache?: boolean;
    quiet?: boolean;
    debugLog?: boolean;
}

interface NccWatchObject {
    watch: any;
    inputFileSystem: webpack.InputFileSystem;
}