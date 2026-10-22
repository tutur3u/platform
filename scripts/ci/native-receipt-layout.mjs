const WIRE_ENCODING = 'scoped-layouts-v1';
const MAX_WIRE = 16 * 1024;
const MAX_EXPANDED = 1024 * 1024;
const MAX_DEPTH = 64;
const MAX_NODES = 32768;
const SCOPED = new Set(['inventory', 'defaultProbe']);
const RESERVED = new Set(['__proto__', 'constructor', 'prototype']);
const own = (value, key) => Object.hasOwn(value, key);
const object = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
function invalid() {
  throw new Error('invalid_diagnostic_receipt');
}
function property(target, key, value) {
  if (RESERVED.has(key)) invalid();
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    configurable: true,
    writable: true,
  });
}
function budget() {
  let nodes = 0;
  let bytes = 0;
  return (depth, cost = 0) => {
    if (depth > MAX_DEPTH || ++nodes > MAX_NODES)
      throw new Error('diagnostic_receipt_limit');
    bytes += cost;
    if (bytes > MAX_EXPANDED) throw new Error('diagnostic_receipt_limit');
  };
}
function scalar(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  invalid();
}
function clone(value, visit, depth = 0) {
  visit(depth, 2);
  if (Array.isArray(value))
    return value.map((item) => clone(item, visit, depth + 1));
  if (object(value)) {
    const result = {};
    for (const key of Object.keys(value)) {
      visit(depth, Buffer.byteLength(JSON.stringify(key)) + 2);
      if (RESERVED.has(key)) invalid();
      const item = value[key];
      if (item === undefined) continue;
      property(result, key, clone(item, visit, depth + 1));
    }
    return result;
  }
  const result = scalar(value);
  visit(depth, Buffer.byteLength(JSON.stringify(result)));
  return result;
}
function logical(value) {
  if (
    !object(value) ||
    value.schema !== 1 ||
    own(value, 'wireEncoding') ||
    own(value, 'layouts')
  )
    invalid();
  return clone(value, budget());
}

// Diagnostic transport only. Neither collection nor live acceptance uses layouts.
export function encodeReceipt(receipt) {
  const input = logical(receipt);
  if (![...SCOPED].some((key) => own(input, key))) return input;
  const layouts = [];
  const indexes = new Map();
  let propertyCount = 0;
  function encode(value) {
    if (Array.isArray(value)) return [1, ...value.map(encode)];
    if (!object(value)) return value;
    const keys = Object.keys(value);
    const signature = JSON.stringify(keys);
    if (!indexes.has(signature)) {
      propertyCount += keys.length;
      if (layouts.length >= 1024 || propertyCount > 8192)
        throw new Error('diagnostic_receipt_limit');
      indexes.set(signature, layouts.length);
      layouts.push(keys);
    }
    return [
      0,
      indexes.get(signature),
      ...keys.map((key) => encode(value[key])),
    ];
  }
  const result = {};
  for (const [key, value] of Object.entries(input))
    property(
      result,
      key,
      key === 'schema' ? 2 : SCOPED.has(key) ? encode(value) : value
    );
  result.wireEncoding = WIRE_ENCODING;
  result.layouts = layouts;
  return result;
}

export function decodeReceipt(input) {
  const serialized = input;
  if (
    typeof serialized !== 'string' ||
    Buffer.byteLength(
      serialized.endsWith('\n') ? serialized : `${serialized}\n`
    ) > MAX_WIRE
  )
    invalid();
  let wire;
  try {
    wire = JSON.parse(serialized);
  } catch {
    invalid();
  }
  if (!object(wire)) invalid();
  if (wire.schema === 1) return logical(wire);
  if (
    wire.schema !== 2 ||
    wire.wireEncoding !== WIRE_ENCODING ||
    !Array.isArray(wire.layouts) ||
    wire.layouts.length > 1024 ||
    ![...SCOPED].some((key) => own(wire, key))
  )
    invalid();
  const layouts = wire.layouts;
  const signatures = new Set();
  let propertyCount = 0;
  for (const keys of layouts) {
    if (!Array.isArray(keys)) invalid();
    propertyCount += keys.length;
    if (
      propertyCount > 8192 ||
      keys.some((key) => typeof key !== 'string' || RESERVED.has(key)) ||
      new Set(keys).size !== keys.length
    )
      invalid();
    const signature = JSON.stringify(keys);
    if (signatures.has(signature)) invalid();
    signatures.add(signature);
  }
  const visit = budget();
  function decode(value, depth) {
    visit(depth, 2);
    if (!Array.isArray(value)) {
      const result = scalar(value);
      visit(depth, Buffer.byteLength(JSON.stringify(result)));
      return result;
    }
    if (value[0] === 1)
      return value.slice(1).map((item) => decode(item, depth + 1));
    if (
      value[0] !== 0 ||
      !Number.isInteger(value[1]) ||
      value[1] < 0 ||
      value[1] >= layouts.length
    )
      invalid();
    const keys = layouts[value[1]];
    if (value.length !== keys.length + 2) invalid();
    const result = {};
    for (let i = 0; i < keys.length; i++) {
      visit(depth, Buffer.byteLength(JSON.stringify(keys[i])) + 2);
      property(result, keys[i], decode(value[i + 2], depth + 1));
    }
    return result;
  }
  const result = {};
  for (const [key, value] of Object.entries(wire)) {
    if (key === 'wireEncoding' || key === 'layouts') continue;
    property(
      result,
      key,
      key === 'schema'
        ? 1
        : SCOPED.has(key)
          ? decode(value, 0)
          : clone(value, visit)
    );
  }
  return result;
}
