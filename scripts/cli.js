#!/usr/bin/env node
// we separate `src/cli` and `scripts/cli` so that we can launch `ncc`
// against a pure-js file without the shebang. in the future,
// ncc should support taking in an input with a shebang,
// and preserving it in the output
require('../dist/ncc/cli');
