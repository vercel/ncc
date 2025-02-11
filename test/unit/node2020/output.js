/******/ (() => { // webpackBootstrap
// added in es2025
// https://babeljs.io/docs/babel-plugin-transform-regexp-modifiers
//    const regex = /(?i:a)a/
// output for es2024
//    const regex = /(?:[Aa])a/
// but throws an error:
// Module parse failed: Invalid regular expression: /(?i:a)a/: Invalid group (3:15) You may need an appropriate loader to handle this file type, currently no loaders are configured to process this file. See https://webpack.js.org/concepts#loaders

// added in node22
// https://nodejs.org/en/blog/announcements/v22-release-announce
  new Set([1, 2]).intersection(new Set([2, 3])); // Set(1) { 2 }
// output for node20
//    import "core-js/modules/es.set.js";
//    new Set([1, 2]).intersection(new Set([2, 3])); // Set(1) { 2 }
// but remains unchanged with target: node16 and doesnt add core-js imports

// added in es2024 + node20
// https://babeljs.io/docs/babel-plugin-transform-unicode-sets-regex
// https://nodejs.org/en/blog/announcements/v20-release-announce
    /[\p{ASCII}&&\p{Decimal_Number}]/v;
// output es2023 node20
//    /[0-9]/u;
// but remains unchanged with target: node16

/******/ })()
;