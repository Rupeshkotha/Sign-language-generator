module.exports = {
    env: {
      browser: true,
      es2021: true,
      webextensions: true  // This enables Chrome extension globals
    },
    extends: [
      'react-app',
      'react-app/jest'
    ],
    globals: {
      chrome: 'readonly'  // This tells ESLint that chrome is a global variable
    },
    parserOptions: {
      ecmaVersion: 12,
      sourceType: 'module'
    },
    rules: {
      'no-undef': 'error'
    }
  };