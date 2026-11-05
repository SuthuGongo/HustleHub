module.exports = {
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/jest.setup.js'],
  testMatch: ['<rootDir>/src/**/*.test.js'],
  // Used by `npm run test:unit:coverage`; the report is sent to SonarCloud together with the API test coverage.
  collectCoverageFrom: ['src/**/*.js', '!src/**/*.test.js', '!src/**/__tests__/**'],
};
