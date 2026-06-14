import { createRequire } from "node:module";
import { resolve } from "node:path";

const require = createRequire(process.cwd());
const runtimeModulePath = resolve(
  process.cwd(),
  "test/integration/create-require-runtime/runtime.json"
);
const { sentinel } = require(runtimeModulePath);

if (sentinel !== "runtime-require-ok") {
  throw new Error(`Unexpected runtime module value: ${sentinel}`);
}

console.log(sentinel);
