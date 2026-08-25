(() => {
"use strict";
var __webpack_modules__ = ({
990(__unused_rspack_module, exports) {

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.greet = greet;
function greet() {
    return "hello";
}


},

});
// The module cache
var __webpack_module_cache__ = {};

// The require function
function __nccwpck_require__(moduleId) {

// Check if module is in cache
var cachedModule = __webpack_module_cache__[moduleId];
if (cachedModule !== undefined) {
// ncc retries failed CommonJS modules on the next require.
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
delete __webpack_module_cache__[moduleId];
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
const dep_1 = __nccwpck_require__(990);
console.log((0, dep_1.greet)());

})();

module.exports = __webpack_exports__;
})()
;