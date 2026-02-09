(() => {
"use strict";
var __webpack_modules__ = ({
372(__unused_rspack_module, exports) {

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports["default"] = {};


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
var exports = __webpack_exports__;

Object.defineProperty(exports, "__esModule", ({ value: true }));
const _module_1 = __nccwpck_require__(372);
console.log(_module_1.default);

})();

module.exports = __webpack_exports__;
})()
;
