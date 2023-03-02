const fs = require('fs-extra');
const path = require('path');
const { exec } = require('./util');

(async function() {
  const rootDir = path.resolve(__dirname, '../');
  const tempDir = path.resolve(__dirname, '../temp');
  await fs.emptyDir(tempDir);
  const toCopy = [
    'package.json',
    'index.js',
    'lib',
  ];
  for(const file of toCopy) {
    await fs.copy(
      path.join(rootDir, file),
      path.join(tempDir, file),
      {recursive: true},
    );
    await exec('npm', ['install', '--force', '--omit=dev'], tempDir);
  }
})();
