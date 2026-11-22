import assert from 'node:assert/strict';
import test from 'node:test';
import {
  checkSources,
  MAX_DIAGNOSTICS,
  parseDiagnostics,
} from './check-diagnostics.ts';

test('maps gcc plain diagnostics to 1-based request locations with flags', () => {
  const output = [
    "./main.c: In function 'main':",
    "./main.c:4:9: error: 'y' undeclared (first use in this function)",
    "./main.c:3:7: warning: unused variable 'x' [-Wunused-variable]",
    './main.c:4:9: note: each undeclared identifier is reported only once',
    './util.c:2: error: expected identifier',
  ].join('\n');
  assert.deepEqual(parseDiagnostics('c', ['main.c', 'util.c'], output, false), {
    truncated: false,
    diagnostics: [
      {
        path: 'main.c',
        line: 4,
        column: 9,
        severity: 'error',
        message: "'y' undeclared (first use in this function)",
        source: 'gcc',
      },
      {
        path: 'main.c',
        line: 3,
        column: 7,
        severity: 'warning',
        message: "unused variable 'x'",
        code: '-Wunused-variable',
        source: 'gcc',
      },
      {
        path: 'main.c',
        line: 4,
        column: 9,
        severity: 'info',
        message: 'each undeclared identifier is reported only once',
        source: 'gcc',
      },
      {
        path: 'util.c',
        line: 2,
        column: 1,
        severity: 'error',
        message: 'expected identifier',
        source: 'gcc',
      },
    ],
  });
});

test('never echoes text from a file outside the request', () => {
  // An absolute include makes the compiler quote another file's tokens.
  const output = [
    'In file included from ./lib.h:2,',
    '                 from ./main.cpp:1:',
    "/proc/self/environ:1:1: error: 'SECRET_TOKEN' does not name a type",
    "/usr/include/stdio.h:10:3: note: declared here 'root:x:0:0'",
    "/etc/passwd:1:5: error: expected ';' before 'x'",
  ].join('\n');
  const { diagnostics } = parseDiagnostics(
    'cpp',
    ['main.cpp', 'lib.h'],
    output,
    false
  );
  assert.deepEqual(diagnostics, [
    {
      path: 'lib.h',
      line: 2,
      column: 1,
      severity: 'error',
      message: 'Problem in an included file',
      source: 'g++',
    },
  ]);
  const text = JSON.stringify(diagnostics);
  for (const leaked of ['SECRET_TOKEN', 'root:x', 'passwd', 'environ', '/proc'])
    assert.equal(text.includes(leaked), false, leaked);
});

test('reads javac columns from the caret line and lint categories', () => {
  const output = [
    "./Main.java:3: error: ';' expected",
    '        int x = 1',
    '                 ^',
    './util/List.java:5: warning: [rawtypes] found raw type: List',
    '    List items;',
    '    ^',
    '/opt/Other.java:1: error: hidden',
    'Note: Some input files use unchecked or unsafe operations.',
    '1 error',
    '1 warning',
  ].join('\n');
  assert.deepEqual(
    parseDiagnostics('java', ['Main.java', 'util/List.java'], output, false)
      .diagnostics,
    [
      {
        path: 'Main.java',
        line: 3,
        column: 18,
        severity: 'error',
        message: "';' expected",
        source: 'javac',
      },
      {
        path: 'util/List.java',
        line: 5,
        column: 5,
        severity: 'warning',
        message: 'found raw type: List',
        code: 'rawtypes',
        source: 'javac',
      },
    ]
  );
});

test('caps diagnostics and message length and reports truncation', () => {
  const output = Array.from(
    { length: MAX_DIAGNOSTICS + 5 },
    (_, index) => `./main.c:${index + 1}:1: error: ${'x'.repeat(2000)}`
  ).join('\n');
  const result = parseDiagnostics('c', ['main.c'], output, false);
  assert.equal(result.diagnostics.length, MAX_DIAGNOSTICS);
  assert.equal(result.truncated, true);
  assert.equal(result.diagnostics[0].message.length, 1000);
  assert.equal(
    parseDiagnostics('c', ['main.c'], './main.c:1:1: error: x', true).truncated,
    true
  );
});

test('compiles the entry, every source of the language, or all Java files', () => {
  const paths = ['main.c', 'util.c', 'lib.h', 'a.cpp', 'b.cc', 'Main.java'];
  assert.deepEqual(checkSources('c', paths), ['main.c', 'util.c']);
  assert.deepEqual(checkSources('c', paths, 'util.c'), ['util.c']);
  assert.deepEqual(checkSources('c', paths, 'missing.c'), []);
  // A C check never compiles a C++ entry as C++.
  assert.deepEqual(checkSources('c', paths, 'a.cpp'), []);
  assert.deepEqual(checkSources('cpp', paths, 'main.c'), []);
  assert.deepEqual(checkSources('cpp', paths), ['a.cpp', 'b.cc']);
  assert.deepEqual(checkSources('java', paths, 'main.c'), ['Main.java']);
});

test('positions are at least 1 even after a #line 0 directive', () => {
  const { diagnostics } = parseDiagnostics(
    'c',
    ['main.c'],
    './main.c:0:0: error: x',
    false
  );
  assert.equal(diagnostics[0].line, 1);
  assert.equal(diagnostics[0].column, 1);
});
