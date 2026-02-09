(() => {
"use strict";
var __webpack_modules__ = ({});
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
if (typeof __nccwpck_require__ !== 'undefined') __nccwpck_require__.ab = __dirname + "/";// webpack/runtime/compat_get_default_export
(() => {
// getDefaultExport function for compatibility with non-ESM modules
__nccwpck_require__.n = (module) => {
	var getter = module && module.__esModule ?
		() => (module['default']) :
		() => (module);
	__nccwpck_require__.d(getter, { a: getter });
	return getter;
};

})();
// webpack/runtime/define_property_getters
(() => {
__nccwpck_require__.d = (exports, definition) => {
	for(var key in definition) {
        if(__nccwpck_require__.o(definition, key) && !__nccwpck_require__.o(exports, key)) {
            Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
        }
    }
};
})();
// webpack/runtime/has_own_property
(() => {
__nccwpck_require__.o = (obj, prop) => (Object.prototype.hasOwnProperty.call(obj, prop))
})();
var __webpack_exports__ = {};

;// CONCATENATED MODULE: external "piscina"
const external_piscina_namespaceObject = require("piscina");
var external_piscina_default = /*#__PURE__*/__nccwpck_require__.n(external_piscina_namespaceObject);
;// CONCATENATED MODULE: external "path"
const external_path_namespaceObject = require("path");
;// CONCATENATED MODULE: ./test/unit/bundle-subasset2/input.ts


const piscina = new (external_piscina_default())({
    filename: __nccwpck_require__.ab + "pi-bridge.js",
});
(async function () {
    const result = await piscina.runTask(2);
    console.log(result);
})();

module.exports = __webpack_exports__;
})()
;
