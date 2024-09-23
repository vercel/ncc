/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ 708:
/***/ ((module) => {

"use strict";
module.exports = require("external-replace/replaced/some-file");

/***/ }),

/***/ 371:
/***/ ((module) => {

"use strict";
module.exports = require("externalmapped");

/***/ }),

/***/ 689:
/***/ ((module) => {

"use strict";
module.exports = require("regexexternal");

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __nccwpck_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		var threw = true;
/******/ 		try {
/******/ 			__webpack_modules__[moduleId](module, module.exports, __nccwpck_require__);
/******/ 			threw = false;
/******/ 		} finally {
/******/ 			if(threw) delete __webpack_module_cache__[moduleId];
/******/ 		}
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/compat */
/******/ 	
/******/ 	if (typeof __nccwpck_require__ !== 'undefined') __nccwpck_require__.ab = __dirname + "/";
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
const external = __nccwpck_require__(371);
const regexpExternal = __nccwpck_require__(689);
const regexpExternalMatch = __nccwpck_require__(708)

console.log(external);
console.log(regexpExternal);
console.log(regexpExternalMatch);

module.exports = __webpack_exports__;
/******/ })()
;