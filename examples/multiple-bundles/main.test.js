const assert = require("assert");
const chalk = require("chalk");
const stripAnsi = require("strip-ansi");

const { color, number } = require("./main");

function getValue(fn) {
  return stripAnsi(
    fn()
      .split(/\s/)
      .pop()
  );
}

// color is a function
assert(typeof color === "function");

// color is red or blue for this example
const c = getValue(color);
assert(c === "red" || c === "blue");

// number is a function
assert(typeof number === "function");

// number returns an integer between 0 and 100 by default
const n = getValue(number);
assert(n > 0 && n <= 100);

console.log(chalk.green("Tests pass!"));
