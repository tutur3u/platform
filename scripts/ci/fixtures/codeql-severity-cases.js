// Shared expectations for scripts/ci/fixtures/codeql-severity.sarif.json:
// whether each rule's result counts as high/critical. Both the JS gate
// (codeql-new-alerts.js) and the bootstrap jq gate in codeql.yml must agree.
const path = require('node:path');

const fixture = path.join(__dirname, 'codeql-severity.sarif.json');
const blocking = {
  'js/empty': true,
  'js/missing': true,
  'js/no-properties': true,
  'js/non-numeric': true,
  'js/null': true,
  'js/number-high': true,
  'js/number-low': false,
  'js/string-high': true,
  'js/string-low': false,
  'js/unknown-rule': true,
};

module.exports = { blocking, fixture };
