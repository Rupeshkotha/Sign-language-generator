module.exports = {
    transform: {
      '^.+\\.jsx?$': 'babel-jest', // This line ensures Babel transforms your files
    },
    testEnvironment: 'jsdom',
    moduleFileExtensions: ['js', 'jsx'],
    transformIgnorePatterns: ['<rootDir>/node_modules/(?!axios)'], // Ensure axios is transformed
  };