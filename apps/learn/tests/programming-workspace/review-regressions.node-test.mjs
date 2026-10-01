import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { observeMobileHeaderHeight } from '../../../../packages/ui/src/components/ui/custom/mobile-header-height.ts';

const require = createRequire(import.meta.url);
const { transformSync } = require('esbuild');
const coding = path.resolve(
  import.meta.dirname,
  '../../src/app/[locale]/(dashboard)/[wsId]/coding'
);
function load(file, mocks) {
  const source = transformSync(
    fs
      .readFileSync(file, 'utf8')
      .replaceAll('import.meta.url', "'file:///synthetic/editor'"),
    {
      loader: file.endsWith('.tsx') ? 'tsx' : 'ts',
      format: 'cjs',
    }
  ).code;
  const exports = {};
  const module = { exports };
  vm.runInNewContext(
    source.replaceAll('import.meta.url', "'file:///synthetic/editor'"),
    {
      exports,
      module,
      require: (name) => {
        if (!(name in mocks)) throw new Error(`Unexpected import ${name}`);
        return mocks[name];
      },
      ...mocks.globals,
    }
  );
  return module.exports;
}

test('mobile header includes safe area, wrapping, breakpoint changes and cleanup', () => {
  const original = globalThis.ResizeObserver;
  let resize,
    observed,
    disconnected = false;
  globalThis.ResizeObserver = class {
    constructor(callback) {
      resize = callback;
    }
    observe(node) {
      observed = node;
    }
    disconnect() {
      disconnected = true;
    }
  };
  let height = 96;
  const nav = { getBoundingClientRect: () => ({ height }) };
  const properties = new Map();
  const main = {
    style: {
      setProperty: (key, value) => properties.set(key, value),
      removeProperty: (key) => properties.delete(key),
    },
  };
  try {
    const cleanup = observeMobileHeaderHeight(nav, main);
    assert.equal(observed, nav);
    assert.equal(properties.get('--mobile-nav-height'), '96px');
    height = 140;
    resize();
    assert.equal(properties.get('--mobile-nav-height'), '140px');
    height = 0;
    resize();
    assert.equal(properties.get('--mobile-nav-height'), '0px');
    cleanup();
    assert.equal(disconnected, true);
    assert.equal(properties.size, 0);
  } finally {
    globalThis.ResizeObserver = original;
  }
});

function editorHarness(fontPromise) {
  let element,
    disposed,
    refreshes = 0,
    layouts = 0;
  const react = { useRef: (current) => ({ current }), useCallback: (fn) => fn };
  const monaco = {
    typescript: {
      javascriptDefaults: { setCompilerOptions() {}, addExtraLib() {} },
      typescriptDefaults: { setCompilerOptions() {}, addExtraLib() {} },
      ModuleResolutionKind: { NodeJs: 1 },
      ScriptTarget: { ES2020: 1 },
    },
    KeyMod: { CtrlCmd: 1 },
    KeyCode: { Enter: 1 },
    editor: {
      remeasureFonts() {
        refreshes++;
      },
    },
  };
  const { CodingEditor } = load(path.join(coding, 'coding-editor.tsx'), {
    '@monaco-editor/react': { default() {}, loader: { config() {} } },
    'monaco-editor': monaco,
    'next-themes': { useTheme: () => ({ resolvedTheme: 'dark' }) },
    react,
    './coding-font': {
      programmingFont: { style: { fontFamily: 'SyntheticFont' } },
    },
    globals: {
      React: { createElement: (_type, props) => (element = props) },
      document: {
        fonts: { load: () => fontPromise, ready: Promise.resolve() },
      },
    },
  });
  CodingEditor({
    language: 'python',
    challenge: 'synthetic',
    source: '',
    onRun() {},
  });
  element.onMount({
    addCommand() {},
    onDidDispose(fn) {
      disposed = fn;
    },
    layout() {
      layouts++;
    },
    focus() {},
  });
  return { dispose: () => disposed(), counts: () => [refreshes, layouts] };
}
const settle = () => new Promise((resolve) => setImmediate(resolve));
test('font rejection keeps editor fallback without unhandled rejection', async () => {
  const editor = editorHarness(
    Promise.reject(new Error('Synthetic offline font'))
  );
  await settle();
  assert.deepEqual(editor.counts(), [0, 0]);
});
test('loaded font remeasures once and disposed editor skips remeasure', async () => {
  const editor = editorHarness(Promise.resolve());
  await settle();
  assert.deepEqual(editor.counts(), [1, 1]);
  const disposed = editorHarness(Promise.resolve());
  disposed.dispose();
  await settle();
  assert.deepEqual(disposed.counts(), [0, 0]);
});

test('synthetic custom result carries custom input and consistent case statistics', async () => {
  const fixture = load(path.join(import.meta.dirname, 'judge.ts'), {
    '../../src/lib/coding/languages': { isCodingLanguage: () => true },
  });
  const customCase = { input: 'synthetic input', expected: 'synthetic output' };
  await fixture.submitCodingSolution(
    'ws',
    undefined,
    'two-sum',
    'python',
    'source',
    'test',
    customCase
  );
  const submission = await fixture.getCodingSubmission();
  assert.deepEqual({ ...submission.customCase }, customCase);
  assert.equal(submission.result.results[0].output, customCase.expected);
  assert.equal(submission.result.total, submission.result.results.length);
  assert.equal(submission.result.passed, 1);
  assert.equal(JSON.stringify(submission.result.timingRangeMs), '[3,3]');
});

test('browser verdict expectation matches actual fixture counts for Run and Submit', async () => {
  const fixture = load(path.join(import.meta.dirname, 'judge.ts'), {
    '../../src/lib/coding/languages': { isCodingLanguage: () => true },
  });
  const browser = fs.readFileSync(
    path.join(import.meta.dirname, 'run-ui.mjs'),
    'utf8'
  );
  const expectation = browser.match(
    /getByText\('([0-9]+ of [0-9]+ cases passed)', \{ exact: true \}\)/
  )?.[1];
  assert.ok(expectation, 'Browser batch must wait for the exact case verdict');
  for (const challenge of ['two-sum', 'binary-search']) {
    for (const kind of ['test', 'submit']) {
      await fixture.submitCodingSolution(
        'ws',
        undefined,
        challenge,
        'python',
        'source',
        kind
      );
      const { result } = await fixture.getCodingSubmission();
      assert.equal(result.total, result.results.length);
      assert.equal(
        result.passed,
        result.results.filter((item) => item.passed).length
      );
      assert.equal(
        expectation,
        `${result.passed} of ${result.total} cases passed`
      );
      assert.equal(result.hiddenPassed, 0);
      assert.equal(result.hiddenTotal, 0);
    }
  }
});

test('disabled toolbar tooltip is focusable without adding enabled duplicate tab stops', () => {
  const tree = [];
  const mocks = {
    '@tuturuuu/icons': { Play: 'Play', Send: 'Send' },
    '@tuturuuu/ui/button': { Button: 'Button' },
    '@tuturuuu/ui/select': Object.fromEntries(
      [
        'Select',
        'SelectContent',
        'SelectItem',
        'SelectTrigger',
        'SelectValue',
      ].map((key) => [key, key])
    ),
    '@tuturuuu/ui/tooltip': {
      Tooltip: 'Tooltip',
      TooltipContent: 'TooltipContent',
      TooltipTrigger: 'TooltipTrigger',
    },
    'next-intl': { useTranslations: () => (value) => value },
    '@/lib/coding/languages': { CODING_LANGUAGES: ['python'] },
    globals: {
      React: {
        createElement(type, props) {
          tree.push({ type, props });
        },
      },
    },
  };
  const { CodingToolbar } = load(
    path.join(coding, 'coding-toolbar.tsx'),
    mocks
  );
  for (const disabled of [true, false]) {
    tree.length = 0;
    CodingToolbar({
      disabled,
      challenge: { topic: 'arrays', difficulty: 'easy' },
      challenges: [],
      availableLanguages: [],
    });
    const wrappers = tree.filter(
      (node) => node.type === 'span' && node.props?.className === 'inline-flex'
    );
    assert.equal(wrappers.length, 2);
    assert.ok(
      wrappers.every(
        (node) => node.props.tabIndex === (disabled ? 0 : undefined)
      )
    );
  }
});

test('batch budget includes child work and teardown, and reports signal/error failures', () => {
  const code = fs
    .readFileSync(
      path.join(import.meta.dirname, 'run-font-fix-batch.mjs'),
      'utf8'
    )
    .replace(/^import .*;$/gm, '')
    .replace('import.meta.dirname', "'/synthetic'");
  const calls = [],
    errors = [];
  const process = { env: {}, execPath: 'node' };
  vm.runInNewContext(code, {
    path,
    process,
    spawnSync: (_command, args, options) => {
      calls.push({ args, options });
      return { status: null, signal: 'SIGTERM', error: new Error('ETIMEDOUT') };
    },
    console: { error: (message) => errors.push(message) },
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.timeout, 750000);
  assert.match(errors[0], /SIGTERM.*ETIMEDOUT/);
  assert.equal(process.exitCode, 1);
});
