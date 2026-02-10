(() => {
"use strict";
var __webpack_modules__ = ({
271(module, exports) {

Object.defineProperty(exports, "__esModule", ({ value: true }));
const config = {
    routes: ['/foo']
};
module.exports = config;


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

// startup
// Load entry module and return exports
// This entry module is referenced by other modules so it can't be inlined
if (typeof __nccwpck_require__ !== 'undefined') __nccwpck_require__.ab = __dirname + "/";var __webpack_exports__ = __nccwpck_require__(271);
module.exports = __webpack_exports__;
})()
;
