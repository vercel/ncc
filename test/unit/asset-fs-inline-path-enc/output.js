module.exports =
/******/ (function(modules, runtime) { // webpackBootstrap
/******/ 	"use strict";
/******/ 	// The module cache
/******/ 	var installedModules = {};
/******/
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/
/******/ 		// Check if module is in cache
/******/ 		if(installedModules[moduleId]) {
/******/ 			return installedModules[moduleId].exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = installedModules[moduleId] = {
/******/ 			i: moduleId,
/******/ 			l: false,
/******/ 			exports: {}
/******/ 		};
/******/
/******/ 		// Execute the module function
/******/ 		modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/
/******/ 		// Flag the module as loaded
/******/ 		module.l = true;
/******/
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/
/******/
/******/
/******/
/******/ 	// Load entry module and return exports
/******/ 	return __webpack_require__(627);
/******/ })
/************************************************************************/
/******/ ({

/***/ 589:
/***/ (function(module) {

module.exports = require("path");

/***/ }),

/***/ 627:
/***/ (function(__unusedmodule, __unusedexports, __webpack_require__) {

const fs = __webpack_require__(66);
const { join } = __webpack_require__(589);
console.log(fs.readFileSync(__dirname + '/asset.txt', 'utf8'));

/***/ }),

/***/ 66:
/***/ (function(module) {

module.exports = require("fs");

/***/ })

/******/ });