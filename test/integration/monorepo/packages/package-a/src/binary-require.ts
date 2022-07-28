import {join} from "path";
import {spawn} from "child_process";

export function spawnFakeBinary() {
    const path = join(__dirname, "./fake-binary");
    spawn(path);
}
