import chalk from "chalk";

function logSuccess(msg: string) {
  console.log(chalk.green(msg));
}

logSuccess("Hello World!");
