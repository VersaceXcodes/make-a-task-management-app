module.exports = {
  "testEnvironment": "node",
  "testTimeout": 10000,
  "setupFilesAfterEnv": [
    "<rootDir>/tests/setup.js"
  ],
  "collectCoverageFrom": [
    "server.js",
    "middleware/**/*.js",
    "utils/**/*.js",
    "!**/node_modules/**"
  ],
  "coverageThreshold": {
    "global": {
      "branches": 90,
      "functions": 90,
      "lines": 90,
      "statements": 90
    }
  },
  "preset": "ts-jest"
};