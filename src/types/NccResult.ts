export interface NccResult {
    code: string;
    map?: string;
    assets: NccAssets;
    symlinks: NccSymlinks;
}

interface NccAsset {
    source: string;
    permissions: number;
}

export type NccAssets = {
    [fileName: string]: NccAsset
};

export type NccSymlinks = {
    [fileName: string]: string
};