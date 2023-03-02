const { exec, getPackageDirs } = require('./util');

const packages = getPackageDirs();

(async function() {
  try {

    for(const packageDir of packages) {
      await exec('npm', ['run', 'test'], packageDir);
    }

  } catch(err) {
    console.error(err);
    process.exit(1);
  }
})();
