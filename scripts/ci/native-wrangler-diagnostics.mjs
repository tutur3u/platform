import { join } from 'node:path';

export function syntaxCauseProjection(startup, plan = {}) {
  const lines = [],
    seen = new Set(),
    queue = [{ error: startup, depth: 0 }];
  let truncated = false,
    bytes = 0;
  const roles = [
    [plan.copyMain, '<copy-main>'],
    [plan.root && join(plan.root, 'main.mjs'), '<original-main>'],
    [plan.copyRoot, '<copy-root>'],
    [plan.root, '<original-root>'],
    [plan.scratch, '<scratch>'],
  ].filter(([path]) => typeof path === 'string');
  const normalize = (value) => {
    let text = value;
    for (const [path, role] of roles) text = text.split(path).join(role);
    return text;
  };
  const bounded = (value, cap = 80) => {
    if (Buffer.byteLength(value) <= cap) return value;
    truncated = true;
    return `${value.slice(0, cap / 2)}<truncated>`;
  };
  const parserText = (value) => {
    if (typeof value !== 'string') return '<missing>';
    const sample = value.slice(0, 1024);
    const input = Buffer.from(sample).subarray(0, 1024).toString('utf8');
    if (sample.length < value.length || Buffer.byteLength(sample) > 1024)
      truncated = true;
    const safe = [];
    for (const raw of input.split('\n').slice(0, 12)) {
      const line = normalize(raw.trim());
      if (
        /^(?:Build|Transform) failed with \d+ errors?:?$/.test(line) ||
        /^(?:(?:<copy-main>|<original-main>):\d+:\d+: ERROR: )?Unexpected ["']=(["'])$/.test(
          line
        )
      )
        safe.push(line);
      else if (
        line.startsWith('Public SDK startup rejected; scratch retained: ')
      )
        safe.push(
          'Public SDK startup rejected; scratch retained: <redacted-path>'
        );
    }
    if (input.split('\n').length > 12) truncated = true;
    return bounded(safe.join(' | ') || '<redacted-text>');
  };
  while (queue.length && lines.length < 4) {
    const { error, depth } = queue.shift();
    if (!error || typeof error !== 'object') continue;
    if (seen.has(error) || depth > 3) {
      truncated = true;
      continue;
    }
    seen.add(error);
    const name = 'Error,SyntaxError,TypeError,BuildFailure,TransformError'
      .split(',')
      .includes(error.name)
      ? error.name
      : '<redacted-name>';
    const code =
      error.code == null
        ? '<missing>'
        : 'ERR_RUNTIME_FAILURE,ERR_ASSERTION,ERR_MODULE_NOT_FOUND,ERR_PARSE_ERROR'
              .split(',')
              .includes(error.code)
          ? error.code
          : '<redacted-code>';
    const location = error.location;
    const file =
      typeof location?.file === 'string'
        ? (roles.find(
            ([path]) =>
              path === location.file || `file://${path}` === location.file
          )?.[1] ?? '<redacted-path>')
        : '<missing>';
    const integer = (value) =>
      Number.isInteger(value) && value >= 0 && value <= 1000000
        ? value
        : '<missing>';
    const routes = [
      'guessWorkerFormat',
      'getEntry',
      'failureErrorWithLog',
      'ConfigController',
      'BundleController',
      'startWorker',
      'teardown',
    ];
    const stack = typeof error.stack === 'string' ? error.stack : '';
    const route =
      routes
        .filter((key) =>
          new RegExp(`\\bat [^\\n]*\\b${key}\\b`).test(stack.slice(0, 1024))
        )
        .join(',') || '<missing>';
    if (stack.length > 1024) truncated = true;
    const fields = {
      depth,
      name,
      code,
      message: parserText(error.message),
      text: parserText(error.text),
      file,
      line: integer(location?.line),
      column: integer(location?.column),
      route: bounded(route),
    };
    const line = `native-syntax ${Object.entries(fields)
      .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
      .join(' ')}`;
    const size = Buffer.byteLength(line) + 1;
    if (bytes + size > 1250) {
      truncated = true;
      break;
    }
    lines.push(line);
    bytes += size;
    if (error.cause) queue.push({ error: error.cause, depth: depth + 1 });
    if (Array.isArray(error.errors)) {
      if (error.errors.length > 4) truncated = true;
      for (const child of error.errors.slice(0, 4))
        queue.push({ error: child, depth: depth + 1 });
    }
  }
  truncated ||= queue.length > 0;
  lines.push(
    `native-syntax end entries=${lines.length} startup=${startup ? 'observed' : 'missing'} truncated=${truncated} internalTeardown=UNKNOWN`
  );
  return lines;
}

// Only diagnostic fields are read from errors; arbitrary error properties stay private.
const errorKeys = [
  'name',
  'message',
  'stack',
  'code',
  'text',
  'location',
  'residual',
  'cause',
  'errors',
  'detail',
];
const unreadable = new WeakSet();
function read(object, key) {
  try {
    return object[key];
  } catch (error) {
    const marker = { $unreadable: key, thrown: error };
    unreadable.add(marker);
    return marker;
  }
}

function diagnosticArray(value) {
  try {
    return Array.isArray(value);
  } catch {
    return false;
  }
}

function collectionLength(value) {
  const length = read(value, 'length');
  return Number.isSafeInteger(length) && length >= 0 ? length : 0;
}

// Iterative traversal preserves complete acyclic graphs and makes references explicit.
export function diagnosticError(error) {
  if (error == null) return null;
  const holder = {},
    seen = new Map(),
    pending = [{ value: error, target: holder, key: 'value', kind: 'error' }];
  while (pending.length) {
    const { value, target, key, kind } = pending.pop();
    if (value === null || typeof value !== 'object') {
      target[key] =
        typeof value === 'bigint' ? { $bigint: String(value) } : value;
      continue;
    }
    if (seen.has(value)) {
      const previous = seen.get(value);
      if (previous.array)
        previous.target[previous.key] = {
          $id: previous.id,
          $array: previous.record,
        };
      else previous.record.$id = previous.id;
      target[key] = { $ref: previous.id };
      continue;
    }
    const id = seen.size + 1;
    if (diagnosticArray(value)) {
      const entries = [];
      target[key] = entries;
      seen.set(value, { id, target, key, record: entries, array: true });
      const length = read(value, 'length');
      if (!Number.isSafeInteger(length) || length < 0)
        pending.push({ value: length, target: entries, key: 0, kind: 'error' });
      else
        for (let i = length - 1; i >= 0; i--)
          pending.push({
            value: read(value, i),
            target: entries,
            key: i,
            kind,
          });
      continue;
    }
    const record = {};
    seen.set(value, { id, target, key, record });
    target[key] = record;
    const keys = unreadable.has(value)
      ? ['$unreadable', 'thrown']
      : kind === 'location'
        ? ['file', 'line', 'column']
        : errorKeys;
    for (const field of keys) {
      const child = read(value, field);
      if (child === undefined) continue;
      pending.push({
        value: child,
        target: record,
        key: field,
        kind: field === 'location' ? 'location' : 'error',
      });
    }
  }
  return holder.value;
}

// JSON.stringify recurses even when its input graph was built iteratively.
// Records here contain only explicitly selected diagnostic fields and owned metadata.
export function privateDiagnosticJSON(value) {
  const output = [],
    active = new Set(),
    tasks = [{ value }];
  while (tasks.length) {
    const task = tasks.pop();
    if (task.text !== undefined) {
      output.push(task.text);
      continue;
    }
    if (task.leave) {
      active.delete(task.leave);
      continue;
    }
    const item = task.value;
    if (item === null || typeof item !== 'object') {
      output.push(
        typeof item === 'bigint'
          ? JSON.stringify(String(item))
          : (JSON.stringify(item) ?? 'null')
      );
      continue;
    }
    if (active.has(item))
      throw new TypeError('Unnormalized private diagnostic cycle');
    active.add(item);
    tasks.push({ leave: item });
    const array = diagnosticArray(item);
    const keys = array
      ? Array.from({ length: item.length }, (_, i) => i)
      : Object.keys(item).filter((key) => item[key] !== undefined);
    output.push(array ? '[' : '{');
    tasks.push({ text: array ? ']' : '}' });
    for (let i = keys.length - 1; i >= 0; i--) {
      const key = keys[i];
      tasks.push({ value: item[key] });
      if (!array) tasks.push({ text: `${JSON.stringify(key)}:` });
      if (i) tasks.push({ text: ',' });
    }
  }
  return output.join('');
}

export function receiptError(error) {
  if (!error) return null;
  const messages = [],
    seen = new Set(),
    pending = [error];
  while (pending.length) {
    const value = pending.pop();
    if (!value || typeof value !== 'object' || seen.has(value)) continue;
    seen.add(value);
    for (const key of ['name', 'message', 'text']) {
      const text = read(value, key);
      if (typeof text === 'string') messages.push(text);
    }
    const errors = read(value, 'errors');
    if (diagnosticArray(errors)) {
      for (let i = collectionLength(errors) - 1; i >= 0; i--)
        pending.push(read(errors, i));
    } else if (errors != null) pending.push(errors);
    pending.push(read(value, 'cause'));
  }
  const code = read(error, 'code'),
    name = read(error, 'name');
  return {
    code: typeof code === 'string' ? code.slice(0, 128) : null,
    name: typeof name === 'string' ? name.slice(0, 128) : '<unreadable>',
    message: messages.join('\n').slice(0, 2048),
  };
}

// This is the actual child emission seam. Diagnostics cannot skip classification.
export async function emitChildDiagnostics(
  { receipt, errors, plan },
  {
    writePrivate,
    writeReceipt,
    classify,
    project = syntaxCauseProjection,
    writeLine = console.log,
    writeFailure = console.error,
  }
) {
  const faults = [];
  let persistenceError, classificationError;
  try {
    await writePrivate(
      'child-phase-errors.json',
      privateDiagnosticJSON({
        ...Object.fromEntries(
          Object.entries(errors).map(([key, error]) => [
            key,
            diagnosticError(error),
          ])
        ),
        disposeIsStartup: receipt.disposeIsStartup,
      })
    );
    await writeReceipt(JSON.stringify(receipt));
  } catch (error) {
    persistenceError = error;
  }
  if (receipt.case === 'syntax') {
    try {
      for (const line of project(errors.startup, plan)) writeLine(line);
    } catch (error) {
      faults.push(error);
      try {
        writeLine('native-syntax diagnostics=fail internalTeardown=UNKNOWN');
      } catch (failure) {
        faults.push(failure);
      }
    }
  }
  try {
    classify(receipt, receipt.case);
  } catch (error) {
    classificationError = error;
  }
  if (classificationError || faults.length) {
    try {
      writeFailure('native-child classification=NOTPASS');
    } catch (error) {
      faults.push(error);
    }
  }
  if (faults.length) {
    try {
      await writePrivate(
        'child-diagnostic-faults.json',
        privateDiagnosticJSON(faults.map(diagnosticError))
      );
    } catch (error) {
      faults.push(error);
      // Preserve the original persistence error if there is one.
      persistenceError ??= error;
    }
  }
  if (persistenceError) throw persistenceError;
  return { classificationError, diagnosticFaults: faults, errors };
}

export async function persistWithSummary(persist, summarize, writeFault) {
  let persisted = false,
    summaryFailed = false,
    persistenceError,
    summaryError;
  try {
    await persist();
    persisted = true;
  } catch (error) {
    persistenceError = error;
  }
  try {
    summarize(persisted);
  } catch (error) {
    summaryFailed = true;
    summaryError = error;
    try {
      await writeFault(
        privateDiagnosticJSON({ error: diagnosticError(error) })
      );
    } catch (failure) {
      summaryError = failure;
    }
    try {
      console.error('native-case summary=fail');
    } catch {}
  }
  if (!persisted) throw persistenceError;
  if (summaryFailed) throw summaryError;
}

export function causes(error) {
  const parts = [],
    seen = new Set(),
    pending = [error];
  while (pending.length) {
    const value = pending.pop();
    if (!value) {
      parts.push('');
      continue;
    }
    if (seen.has(value)) {
      parts.push('<reference>');
      continue;
    }
    seen.add(value);
    for (const key of ['name', 'message', 'text']) {
      const text = read(value, key);
      parts.push(typeof text === 'string' ? text : '');
    }
    const errors = read(value, 'errors');
    if (diagnosticArray(errors)) {
      for (let i = collectionLength(errors) - 1; i >= 0; i--)
        pending.push(read(errors, i));
    } else if (errors != null) pending.push(errors);
    pending.push(read(value, 'cause'));
  }
  return parts.join('\n');
}
