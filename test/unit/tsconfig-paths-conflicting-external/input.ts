import module from "@module";
// this matches the pattern specified in tsconfig,
// but it should use the external module instead of erroring
import * as _ from "@sentry/node";

console.log(module);
