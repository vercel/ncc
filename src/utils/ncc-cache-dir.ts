import { tmpdir } from "os";
import { join } from "path";

export function getCacheDir () {
    return join(tmpdir(), "/ncc-cache");
}