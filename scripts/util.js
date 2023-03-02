const fs = require('fs-extra');
const path = require('path');
const { spawn } = require('child_process');

const getPackageDirs = () => {
  const packagesDir = path.resolve(__dirname, '../packages');
  return fs.readdirSync(packagesDir)
    .map(dir => path.join(packagesDir, dir))
    .filter(dirPath => fs.statSync(dirPath).isDirectory());
};
module.exports.getPackageDirs = getPackageDirs;

module.exports.exec = (command, args, cwd) => new Promise((resolve, reject) => {
  const instance = spawn(command, args, {cwd});
  instance.stdout.pipe(process.stdout);
  instance.stderr.pipe(process.stderr);
  instance.on('error', err => reject(err));
  instance.on('close', exitCode => resolve(exitCode));
});
