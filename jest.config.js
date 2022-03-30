module.exports = {
  collectCoverageFrom: ["src/**/*.js"],
  coverageReporters: ["html", "lcov"],
  testEnvironment: "node",
  testMatch: ["<rootDir>/test/**/*.test.js"]
};
