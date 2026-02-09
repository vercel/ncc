(() => {
var __webpack_modules__ = ({
896(module) {
"use strict";
module.exports = require("fs");

},

});
// The module cache
var __webpack_module_cache__ = {};

// The require function
function __nccwpck_require__(moduleId) {

// Check if module is in cache
var cachedModule = __webpack_module_cache__[moduleId];
if (cachedModule !== undefined) {
if (cachedModule.error !== undefined) throw cachedModule.error;
return cachedModule.exports;
}
// Create a new module (and put it into the cache)
var module = (__webpack_module_cache__[moduleId] = {
exports: {}
});
// Execute the module function
try {

__webpack_modules__[moduleId](module, module.exports, __nccwpck_require__);

} catch (e) {
module.error = e;
throw e;
}
// Return the exports of the module
return module.exports;

}

// asset-relocator-loader
if (typeof __nccwpck_require__ !== 'undefined') __nccwpck_require__.ab = __dirname + "/";var __webpack_exports__ = {};
// This entry needs to be wrapped in an IIFE because it needs to be isolated against other modules in the chunk.
(() => {
const { readFileSync } = __nccwpck_require__(896);
console.log(readFileSync(__dirname + './test.json'));


})();

module.exports = __webpack_exports__;
})()
;
