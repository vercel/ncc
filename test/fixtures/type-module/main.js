import { readFileSync } from 'fs';

readFileSync(new URL('./package.json', import.meta.url));

export var p = 5;

