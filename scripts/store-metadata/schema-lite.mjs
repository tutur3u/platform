// Dependency-free validator for the JSON Schema subset used by
// apps/mobile/store/metadata/schema.json, plus the store-specific `x-*`
// keywords. Unknown keywords fail loudly so a schema edit can never be
// silently ignored.

const METADATA_KEYWORDS = new Set([
  '$schema',
  '$id',
  '$defs',
  'title',
  'description',
]);

const KNOWN_KEYWORDS = new Set([
  ...METADATA_KEYWORDS,
  '$ref',
  'additionalProperties',
  'allOf',
  'anyOf',
  'const',
  'enum',
  'if',
  'items',
  'maxItems',
  'maxLength',
  'maximum',
  'minimum',
  'minItems',
  'minLength',
  'minProperties',
  'pattern',
  'properties',
  'propertyNames',
  'required',
  'then',
  'type',
  'x-captionMaxLength',
  'x-maxTotalWords',
  'x-maxUtf8Bytes',
  'x-recommendedMaxLength',
]);

/** Store limits count user-perceived characters; NFC keeps diacritics single. */
export function charLength(value) {
  return [...value.normalize('NFC')].length;
}

export function utf8Bytes(value) {
  return Buffer.byteLength(value, 'utf8');
}

export function wordCount(values) {
  return values.flatMap((value) => value.trim().split(/\s+/u)).length;
}

/** Word totals per language for arrays of strings or of { en, vi } objects. */
function wordTotals(values) {
  if (values.every((value) => typeof value === 'string')) {
    return [['', wordCount(values)]];
  }
  const byLocale = new Map();
  for (const value of values) {
    if (!value || typeof value !== 'object') continue;
    for (const [locale, text] of Object.entries(value)) {
      if (typeof text !== 'string') continue;
      byLocale.set(locale, [...(byLocale.get(locale) ?? []), text]);
    }
  }
  return [...byLocale].map(([locale, texts]) => [
    `${locale}: `,
    wordCount(texts),
  ]);
}

function typeOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (Number.isInteger(value)) return 'integer';
  return typeof value;
}

function matchesType(value, type) {
  const actual = typeOf(value);
  return actual === type || (type === 'number' && actual === 'integer');
}

function resolveRef(root, ref) {
  if (!ref.startsWith('#/')) throw new Error(`Unsupported $ref ${ref}`);
  let node = root;
  for (const part of ref.slice(2).split('/')) {
    node = node?.[part];
  }
  if (!node) throw new Error(`Unresolved $ref ${ref}`);
  return node;
}

function join(path, key) {
  return typeof key === 'number' ? `${path}[${key}]` : `${path}.${key}`;
}

/**
 * Validate `value` against `schema`. Returns `{ errors, warnings }`, each a list
 * of `{ path, message }`.
 */
export function validateSchema(value, schema, root = schema, path = '$') {
  const result = { errors: [], warnings: [] };
  visit(value, schema, root, path, result);
  return result;
}

function visit(value, schema, root, path, result) {
  const fail = (message) => result.errors.push({ path, message });
  for (const keyword of Object.keys(schema)) {
    if (!KNOWN_KEYWORDS.has(keyword)) {
      throw new Error(`Unsupported schema keyword "${keyword}" at ${path}`);
    }
  }

  if (schema.$ref)
    visit(value, resolveRef(root, schema.$ref), root, path, result);

  if (schema.type && !matchesType(value, schema.type)) {
    fail(`expected ${schema.type}, got ${typeOf(value)}`);
    return;
  }
  if ('const' in schema && value !== schema.const) {
    fail(`expected ${JSON.stringify(schema.const)}`);
  }
  if (schema.enum && !schema.enum.includes(value)) {
    fail(
      `expected one of ${schema.enum.join(', ')}, got ${JSON.stringify(value)}`
    );
  }

  if (typeof value === 'string') checkString(value, schema, fail, result, path);
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) {
      fail(`must be >= ${schema.minimum}`);
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      fail(`must be <= ${schema.maximum}`);
    }
  }
  if (Array.isArray(value)) checkArray(value, schema, root, path, result, fail);
  if (typeOf(value) === 'object') {
    checkObject(value, schema, root, path, result, fail);
    checkCaptions(value, schema['x-captionMaxLength'], path, result);
  }

  for (const sub of schema.allOf ?? []) visit(value, sub, root, path, result);
  if (schema.anyOf) {
    const attempts = schema.anyOf.map((sub) =>
      validateSchema(value, sub, root, path)
    );
    if (!attempts.some((attempt) => attempt.errors.length === 0)) {
      // Report the branch whose type matched, so a nullable field shows its
      // real limit instead of a generic mismatch.
      const typed = attempts.filter(
        ({ errors }) =>
          !errors.some(
            (error) =>
              error.path === path && error.message.startsWith('expected ')
          )
      );
      if (typed.length === 0) fail('does not match any allowed shape');
      else result.errors.push(...typed[0].errors);
    }
  }
  if (
    schema.if &&
    validateSchema(value, schema.if, root, path).errors.length === 0
  ) {
    if (schema.then) visit(value, schema.then, root, path, result);
  }
}

function checkString(value, schema, fail, result, path) {
  const length = charLength(value);
  if (schema.minLength !== undefined && length < schema.minLength) {
    fail(`must be at least ${schema.minLength} characters, got ${length}`);
  }
  if (schema.maxLength !== undefined && length > schema.maxLength) {
    fail(`must be at most ${schema.maxLength} characters, got ${length}`);
  }
  const bytes = utf8Bytes(value);
  if (
    schema['x-maxUtf8Bytes'] !== undefined &&
    bytes > schema['x-maxUtf8Bytes']
  ) {
    fail(
      `must be at most ${schema['x-maxUtf8Bytes']} UTF-8 bytes, got ${bytes}`
    );
  }
  const recommended = schema['x-recommendedMaxLength'];
  if (recommended !== undefined && length > recommended) {
    result.warnings.push({
      path,
      message: `${length} characters exceeds the recommended ${recommended}`,
    });
  }
  if (schema.pattern && !new RegExp(schema.pattern, 'u').test(value)) {
    fail(`does not match ${schema.pattern}`);
  }
}

function checkArray(value, schema, root, path, result, fail) {
  if (schema.minItems !== undefined && value.length < schema.minItems) {
    fail(`must have at least ${schema.minItems} items, got ${value.length}`);
  }
  if (schema.maxItems !== undefined && value.length > schema.maxItems) {
    fail(`must have at most ${schema.maxItems} items, got ${value.length}`);
  }
  const maxWords = schema['x-maxTotalWords'];
  if (maxWords !== undefined) {
    for (const [label, total] of wordTotals(value)) {
      if (total > maxWords) {
        fail(
          `${label}must have at most ${maxWords} words in total, got ${total}`
        );
      }
    }
  }
  if (schema.items) {
    value.forEach((item, index) =>
      visit(item, schema.items, root, join(path, index), result)
    );
  }
}

/** `x-captionMaxLength` sits on a device -> screenshot[] map. */
function checkCaptions(sets, max, path, result) {
  if (max === undefined) return;
  for (const [device, shots] of Object.entries(sets)) {
    if (!Array.isArray(shots)) continue;
    shots.forEach((shot, index) => {
      const caption = shot?.caption;
      if (!caption || typeof caption !== 'object') return;
      for (const [locale, text] of Object.entries(caption)) {
        if (typeof text !== 'string' || charLength(text) <= max) continue;
        result.errors.push({
          path: `${join(join(path, device), index)}.caption.${locale}`,
          message: `must be at most ${max} characters, got ${charLength(text)}`,
        });
      }
    });
  }
}

function checkObject(value, schema, root, path, result, fail) {
  for (const key of schema.required ?? []) {
    if (!(key in value)) fail(`missing required property "${key}"`);
  }
  const keys = Object.keys(value);
  if (
    schema.minProperties !== undefined &&
    keys.length < schema.minProperties
  ) {
    fail(`must have at least ${schema.minProperties} properties`);
  }
  for (const key of keys) {
    const child = join(path, key);
    if (schema.propertyNames) {
      const named = validateSchema(key, schema.propertyNames, root, child);
      if (named.errors.length) {
        result.errors.push({ path: child, message: 'unexpected property' });
        continue;
      }
    }
    if (schema.properties && key in schema.properties) {
      visit(value[key], schema.properties[key], root, child, result);
    } else if (schema.additionalProperties === false) {
      result.errors.push({ path: child, message: 'unexpected property' });
    } else if (typeOf(schema.additionalProperties) === 'object') {
      visit(value[key], schema.additionalProperties, root, child, result);
    }
  }
}
