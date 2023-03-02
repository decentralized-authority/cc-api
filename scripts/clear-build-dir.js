const path = require('path');
const fs = require('fs-extra');

(async function() {
  await fs.emptyDir(path.resolve(__dirname, '../lib'));
})();
