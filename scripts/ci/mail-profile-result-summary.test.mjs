import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeBrowserResults } from './mail-profile-result-summary.mjs';

const titles = ['fixed profile', 'fixed transport'];
const spec = (title, status) => ({
  title,
  tests: [{ results: [{ status, retry: 0 }] }],
});

test('preserves passed transport alongside failed profile without leaking errors', () => {
  const summary = summarizeBrowserResults(
    {
      suites: [
        {
          specs: [
            { ...spec(titles[0], 'failed'), error: 'private token' },
            spec(titles[1], 'passed'),
            spec('private unrelated title', 'passed'),
          ],
        },
      ],
    },
    titles
  );
  assert.deepEqual(summary, [
    {
      title: titles[0],
      status: 'failed',
      navigationDiagnostics: {
        state: 'unknown',
        coverage: 'unknown',
        reason: 'absent',
      },
    },
    { title: titles[1], status: 'passed' },
  ]);
  assert.doesNotMatch(JSON.stringify(summary), /private/u);
});

test('does not manufacture success for absent, retried, malformed or duplicate results', () => {
  for (const report of [
    { suites: [] },
    { suites: [{ specs: [spec(titles[0], 'private status')] }] },
    {
      suites: [
        { specs: [spec(titles[0], 'passed'), spec(titles[0], 'passed')] },
      ],
    },
    {
      suites: [
        {
          specs: [
            {
              title: titles[0],
              tests: [
                { results: [{ status: 'failed' }, { status: 'passed' }] },
              ],
            },
          ],
        },
      ],
    },
    { suites: [{ specs: 'private malformed value' }] },
    { suites: Array.from({ length: 201 }, () => ({})) },
  ])
    assert.deepEqual(summarizeBrowserResults(report, titles), []);
});

const marker = '[lettin-e2e] profile navigation diagnostics ';
function safeRecord(dcl = true) {
  return {
    version: 1,
    lifecycle: { domContentLoaded: dcl, load: false },
    hops: [],
    truncated: false,
    loadObservation: {
      version: 1,
      observedAt: 'callback-rejection',
      coverage: 'unknown',
      limits: {
        requests: 64,
        frames: 16,
        events: 128,
        bytes: 49152,
        counter: 65535,
      },
      counts: {
        starts: 0,
        responses: 0,
        finishes: 0,
        failures: 0,
        frameEvents: 0,
        orphan: 0,
        droppedRequests: 0,
        droppedFrames: 0,
        droppedEvents: 0,
        errors: 0,
        timingErrors: 0,
      },
      saturated: false,
      byteTruncated: false,
      omitted: { requests: 0, frames: 0, events: 0 },
      requests: [],
      frames: [],
      events: [],
    },
  };
}
const textEntry = (record) => ({
  text: `${marker}${JSON.stringify(record)}\n`,
});
function terminalResult(stderr, extra = {}, title = titles[0]) {
  const profile = spec(titles[0], 'failed');
  const transport = spec(titles[1], 'passed');
  const target = title === titles[0] ? profile : transport;
  Object.assign(target.tests[0].results[0], { stderr, ...extra });
  return {
    results: summarizeBrowserResults(
      { suites: [{ specs: [profile, transport] }] },
      titles
    ),
  };
}
const evidence = (terminal) => terminal.results[0].navigationDiagnostics;

test('strict reporter text chunks survive terminal projection without changing status', () => {
  for (const dcl of [false, true]) {
    const record = safeRecord(dcl);
    const line = textEntry(record).text;
    for (const cut of [
      1,
      marker.length - 1,
      marker.length + 5,
      line.length - 1,
    ]) {
      const terminal = terminalResult([
        { text: line.slice(0, cut) },
        { text: line.slice(cut) },
      ]);
      assert.equal(terminal.results[0].status, 'failed');
      assert.deepEqual(terminal.results[1], {
        title: titles[1],
        status: 'passed',
      });
      assert.equal(evidence(terminal).state, 'observed');
      assert.deepEqual(evidence(terminal).record, record);
      assert.equal(evidence(terminal).coverage, 'unknown');
    }
  }
});

test('invalid, ambiguous, absent and unsupported streams retain only unknown metadata', () => {
  const line = textEntry(safeRecord()).text;
  for (const [stream, reason] of [
    [undefined, 'absent'],
    [[], 'absent'],
    ['private', 'stream'],
    [[{ buffer: 'cHJpdmF0ZQ==' }], 'chunk'],
    [[{ text: line, buffer: 'private' }], 'chunk'],
    [[{ text: 1 }], 'chunk'],
    [[{ text: line + line }], 'duplicate'],
    [[{ text: line.trimEnd() }], 'partial'],
    [[{ text: `private${line}` }], 'framing'],
    [[{ text: `${marker}{private}\n` }], 'schema'],
    [[{ text: `${marker + ' '.repeat(49153)}\n` }], 'payload'],
    [[{ text: 'x'.repeat(131073) }], 'bytes'],
    [Array.from({ length: 257 }, () => ({ text: '' })), 'entries'],
  ]) {
    const terminal = terminalResult(stream);
    assert.deepEqual(evidence(terminal), {
      state: 'unknown',
      coverage: 'unknown',
      reason,
    });
    assert.deepEqual(terminal.results[1], {
      title: titles[1],
      status: 'passed',
    });
    assert.equal(terminal.results[0].status, 'failed');
    assert.doesNotMatch(JSON.stringify(terminal), /private|buffer|stderr/u);
  }
});

test('unknown keys, sensitive strings, bad enums, counts and schemas are rejected', () => {
  for (const change of [
    (record) => {
      record.version = 2;
    },
    (record) => {
      record.private = 'secret';
    },
    (record) => {
      record.lifecycle.load = 'private';
    },
    (record) => {
      record.loadObservation.coverage = 'clear';
    },
    (record) => {
      record.loadObservation.counts.starts = -1;
    },
    (record) => {
      record.loadObservation.counts.errors = 65536;
    },
    (record) => {
      record.loadObservation.limits.bytes = 100000;
    },
    (record) => {
      record.loadObservation.events = [
        { kind: 'private', request: null, frame: null, at: 0 },
      ];
    },
    (record) => {
      record.loadObservation.events = Array.from({ length: 129 }, () => ({
        kind: 'start',
        request: null,
        frame: null,
        at: 0,
      }));
    },
    (record) => {
      record.loadObservation.events = [
        { kind: 'start', request: null, frame: null, at: 0.5 },
      ];
    },
    (record) => {
      record.loadObservation.requests = [{ url: 'private' }];
    },
  ]) {
    const record = safeRecord();
    change(record);
    const terminal = terminalResult([textEntry(record)]);
    assert.equal(evidence(terminal).reason, 'schema');
    assert.equal(terminal.results[0].status, 'failed');
    assert.doesNotMatch(JSON.stringify(terminal), /private|secret/u);
  }
});

test('attempt and title association never borrows a transport or success marker', () => {
  const stream = [textEntry(safeRecord())];
  for (const retry of [undefined, 1, -1, '0', 0.5]) {
    const terminal = terminalResult(stream, { retry });
    assert.equal(evidence(terminal).reason, 'attempt');
    assert.equal(terminal.results[0].status, 'failed');
    assert.equal(terminal.results[1].status, 'passed');
  }
  const wrong = terminalResult(stream, {}, titles[1]);
  assert.equal(evidence(wrong).reason, 'absent');
  assert.equal(wrong.results[1].navigationDiagnostics, undefined);
  const passed = terminalResult(stream, { status: 'passed' });
  assert.equal(passed.results[0].navigationDiagnostics, undefined);
});

test('helper-emitted synthetic record crosses reporter and terminal shape for both lifecycle cases', async () => {
  const { EventEmitter } = await import('node:events');
  const { observeProfileNavigation } = await import(
    '../../apps/web/e2e/helpers/lettin-profile-navigation-diagnostics.ts'
  );
  for (const dcl of [false, true]) {
    const page = new EventEmitter();
    const base = 'http:' + '//127.0.0.1:3000';
    const main = { url: () => base, parentFrame: () => null };
    const child = { url: () => base, parentFrame: () => main };
    Object.assign(page, { mainFrame: () => main, frames: () => [main, child] });
    const request = (frame, resource) => ({
      frame: () => frame,
      resourceType: () => resource,
      url: () => `${base}/private?secret=private`,
      method: () => 'GET',
      isNavigationRequest: () => resource === 'document',
      redirectedTo: () => null,
    });
    const doc = request(main, 'document');
    const childDoc = request(child, 'document');
    const css = request(child, 'stylesheet');
    const warn = console.warn;
    let line;
    const failure = new Error('private navigation failure');
    console.warn = (label, json) => {
      line = `${label} ${json}\n`;
    };
    try {
      await assert.rejects(
        observeProfileNavigation(page, base, async () => {
          page.emit('request', doc);
          page.emit('request', childDoc);
          page.emit('request', css);
          page.emit('response', {
            request: () => doc,
            frame: () => main,
            status: () => 200,
            url: () => base,
            finished: async () => null,
            headers: () => ({ 'x-private': 'private' }),
          });
          page.emit('requestfinished', doc);
          await Promise.resolve();
          if (dcl) page.emit('domcontentloaded');
          throw failure;
        }),
        (error) => error === failure
      );
    } finally {
      console.warn = warn;
    }
    const terminal = terminalResult([{ text: line }]);
    const record = evidence(terminal).record;
    assert.equal(evidence(terminal).state, 'observed');
    assert.deepEqual(record.lifecycle, { domContentLoaded: dcl, load: false });
    assert.equal(record.hops[0].status, 200);
    assert.equal(record.hops[0].body, 'finished');
    assert.deepEqual(
      record.loadObservation.requests.map((item) => item.terminal),
      ['finished', 'outstanding-at-snapshot', 'outstanding-at-snapshot']
    );
    assert.equal(terminal.results[0].status, 'failed');
    assert.equal(terminal.results[1].status, 'passed');
    assert.doesNotMatch(JSON.stringify(terminal), /private|secret|127\.0\.0/u);
    for (const name of page.eventNames())
      assert.equal(page.listenerCount(name), 0);
  }
});

test('legacy allowlists persist while added keys and contradictory request states reject', () => {
  const record = safeRecord();
  record.hops = [
    {
      route: 'profile',
      locale: 'unprefixed',
      targetRoute: 'profile',
      targetLocale: 'en',
      samePath: false,
      sameOrigin: true,
      status: 307,
      body: 'finished',
      proxy: {
        stage: 'canonical-locale',
        requestLocale: 'unprefixed',
        nextLocale: 'en',
        sameRequestPath: false,
      },
    },
  ];
  record.loadObservation.requests = [
    {
      id: 1,
      frame: null,
      route: 'external',
      origin: 'external',
      resource: 'stylesheet',
      method: 'GET',
      navigation: false,
      start: 0,
      response: null,
      finish: null,
      fail: null,
      status: null,
      terminal: 'outstanding-at-snapshot',
    },
  ];
  assert.deepEqual(
    evidence(terminalResult([textEntry(record)])).record,
    record
  );
  for (const change of [
    (value) => {
      value.hops[0].proxy.private = 'private';
    },
    (value) => {
      value.loadObservation.requests[0].finish = 1;
    },
    (value) => {
      value.loadObservation.requests.push({
        ...value.loadObservation.requests[0],
      });
    },
    (value) => {
      value.loadObservation.requests[0].resource = 'private';
    },
  ]) {
    const changed = structuredClone(record);
    change(changed);
    const terminal = terminalResult([textEntry(changed)]);
    assert.equal(evidence(terminal).reason, 'schema');
    assert.equal(terminal.results[0].status, 'failed');
    assert.equal(terminal.results[1].status, 'passed');
    assert.doesNotMatch(JSON.stringify(terminal), /private/u);
  }
});
