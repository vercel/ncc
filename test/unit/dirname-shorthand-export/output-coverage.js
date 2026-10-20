/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ 887:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

const ngrok = __nccwpck_require__(196);
module.exports = ngrok;


/***/ }),

/***/ 196:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

const { connect } = __nccwpck_require__(806);
module.exports = { connect };


/***/ }),

/***/ 806:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

const { defaultDir, bin } = __nccwpck_require__(292);
async function connect() {
  return defaultDir + "/" + bin;
}
module.exports = { connect };


/***/ }),

/***/ 292:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

const { join } = __nccwpck_require__(928);
const platform = (__nccwpck_require__(857).platform)();

const defaultDir = __nccwpck_require__.ab + "bin";
const bin = platform === "win32" ? "ngrok.exe" : "ngrok";
const ready = /starting web service.*addr=(\d+\.\d+\.\d+\.\d+:\d+)/;
const inUse = /address already in use/;

module.exports = {
  defaultDir:__nccwpck_require__.ab + "bin",
  bin,
  ready,
  inUse,
};


/***/ }),

/***/ 857:
/***/ ((module) => {

"use strict";
module.exports = require("os");

/***/ }),

/***/ 928:
/***/ ((module) => {

"use strict";
module.exports = require("path");

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
/******/ 	/* webpack/runtime/asset-relocator-loader */
/******/ 	if (typeof __nccwpck_require__ !== 'undefined') __nccwpck_require__.ab = __dirname + "/";
/******/ 	
/************************************************************************/
/******/ 	
/******/ 	// startup
/******/ 	// Load entry module and return exports
/******/ 	// This entry module is referenced by other modules so it can't be inlined
/******/ 	var __webpack_exports__ = __nccwpck_require__(887);
/******/ 	module.exports = __webpack_exports__;
/******/ 	
/******/ })()
;