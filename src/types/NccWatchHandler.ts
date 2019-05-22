import { NccResult } from "./NccResult";

export type NccWatchHandler = (opts: {err: Error | string} | NccResult) => void;