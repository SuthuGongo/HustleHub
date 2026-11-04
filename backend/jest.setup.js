// The app refuses to load without these (src/config/env.js). Unit tests never connect to a database,
// so harmless test values are enough to let the modules load.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'unit-test-secret-not-used-anywhere-real';
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/unit_test_never_connected';
process.env.NODE_ENV = 'test';
