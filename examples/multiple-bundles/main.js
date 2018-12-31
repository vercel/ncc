const chalk = require("chalk");

exports.color = function color() {
  const color = Math.random() > 0.5 ? "red" : "blue";

  return `Your lucky color is ${chalk[color](color)}`;
};

exports.number = function number(min = 0, max = 100) {
  min = Math.ceil(min);
  max = Math.floor(max);
  //The maximum is exclusive and the minimum is inclusive
  const num = Math.floor(Math.random() * (max - min)) + min;

  return `Your lucky number is ${chalk.bold(num)}`;
};
