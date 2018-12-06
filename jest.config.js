module.exports = {
  collectCoverageFrom: ["src/**/*.js"],
  coverageReporters: ["html", "lcov"],
  testEnvironment: "node",
  testMatch: ["<rootDir>/test/?(*.)+(spec|test).js?(x)"]
};
