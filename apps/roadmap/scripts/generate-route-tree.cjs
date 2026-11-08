const path = require('node:path');
const {
  generateTanstackRouteTree,
} = require('../../../scripts/generate-tanstack-route-tree.js');

generateTanstackRouteTree({
  appDir: path.resolve(__dirname, '..'),
  formatRouteTree: false,
}).catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
