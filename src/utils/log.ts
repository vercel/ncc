export function log(quiet: boolean, str: string) {
    if (!quiet) {
        console.log(`ncc: ${str}`);
    }
}