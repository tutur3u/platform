const assert = require('node:assert/strict');
const React = require('react');
const { renderToString } = require('react-dom/server');
const workspaceRequire = require('node:module').createRequire(
  require('node:path').resolve(
    __dirname,
    '../packages/programming-ui/package.json'
  )
);
const dynamic = workspaceRequire('next/dynamic');
assert.equal(
  workspaceRequire('next/package.json').version,
  require('../package.json').overrides.next
);
let invoked = false;
const ClientOnly = dynamic(
  () => {
    invoked = true;
    throw new Error('browser-only editor evaluated on server');
  },
  { ssr: false }
);
assert.equal(renderToString(React.createElement(ClientOnly)), '');
assert.equal(invoked, false);
const Loading = dynamic(
  () => {
    throw new Error('must not load');
  },
  {
    ssr: false,
    loading: () => React.createElement('span', null, 'loading editor'),
  }
);
assert.equal(
  renderToString(React.createElement(Loading)),
  '<span>loading editor</span>'
);
console.log(
  'real next/dynamic preserves browser-only editor SSR exclusion and loading fallback'
);
