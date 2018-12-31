#!/usr/bin/env node

const args = require("args");

const { color, number } = require("./main");

args
  .command("color", "Receive a lucky color", () => {
    console.log(color());
  })
  .command("number", "Receive a lucky number", () => {
    console.log(number());
  });

args.parse(process.argv, {
  name: "lucky"
});
