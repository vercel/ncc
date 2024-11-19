import chalk from "chalk";
import * as Sentry from "@sentry/node";

function logSuccess(msg: string) {
  console.log(chalk.green(msg));

  Sentry.init({})
}

logSuccess("Hello World!");
