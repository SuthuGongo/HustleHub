const js = require('@eslint/js');
const security = require('eslint-plugin-security');
const globals = require('globals');

// Static analysis for the backend (Node/Express/MongoDB API). Scope: real bugs and real security
// footguns (eslint:recommended + eslint-plugin-security), not stylistic nitpicking - this runs in
// CI and is meant to catch things worth fixing, not bikeshed formatting.
module.exports = [
  js.configs.recommended,
  security.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: { ...globals.node, ...globals.jest },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', args: 'none' }],
      // This project deliberately builds a few Mongo operators itself (wrapped in mongoose.trusted())
      // instead of taking them from user input - see utils/escrow.js and gigController.js for why.
      // The plugin can't tell "we built this literal object" from "this came from req.body", so it
      // is kept as a reminder (warn) rather than a hard failure here.
      'security/detect-object-injection': 'off',
    },
  },
  {
    ignores: ['node_modules/**', 'coverage/**', 'certs/**', 'scripts/seedAdmin.js'],
  },
];
