import assert from 'node:assert/strict';
import test from 'node:test';
import {
  NativeUploadError,
  productionFailureMessage,
} from './wave1-native-upload-error.mjs';

function retained(message, secrets = []) {
  const error = new NativeUploadError({ stderr: message }, secrets);
  return {
    error,
    text: `${JSON.stringify(error)}\n${productionFailureMessage(error)}`,
  };
}
const parts = () => ['abcd1234', 'WXYZ5678', 'efgh9012'].join('');
for (const [name, transform] of [
  ['zero-width', (value) => `${value.slice(0, 12)}\u200b${value.slice(12)}`],
  ['line-wrapped', (value) => `${value.slice(0, 12)}\n${value.slice(12)}`],
]) {
  test(`known ${name} token is removed before normalization and line selection`, () => {
    const raw = transform(parts());
    const { text } = retained(`[ERROR] Invalid ${raw}`, [raw]);
    assert.equal(text.includes(parts().slice(0, 12)), false);
    assert.equal(text.includes(parts().slice(12)), false);
  });
  test(`display-${name} token is removed using its unsplit known value`, () => {
    const { text } = retained(`[ERROR] Invalid ${transform(parts())}`, [
      parts(),
    ]);
    assert.equal(text.includes(parts().slice(0, 12)), false);
    assert.equal(text.includes(parts().slice(12)), false);
  });
}

for (const name of [
  'sig',
  'signature',
  'token',
  'X-Amz-Signature',
  'X-Amz-Credential',
  'arbitrary',
])
  test(`URL query ${name} value is fully redacted, including percent encoding`, () => {
    const value = ['short', '%3B', 'continuation', '%25', 'value'].join('');
    const { text } = retained(
      `[ERROR] GET https://example.test/path?${name}=${value}&mode=unsafe`
    );
    assert.equal(text.includes('continuation'), false);
    assert.equal(text.includes('%3B'), false);
    assert.equal(text.includes('unsafe'), false);
  });

for (const name of [
  'auth',
  'credentials',
  'credential',
  'pwd',
  'sig',
  'signature',
  'secret2',
  'SeCrEt99',
  'X-Amz-Credential',
])
  test(`credential field ${name} is redacted through semicolon continuation`, () => {
    const { text } = retained(
      `[ERROR] ${name}=first;second third, safe-message`
    );
    for (const fragment of ['first', 'second', 'third'])
      assert.equal(text.includes(fragment), false);
    assert.ok(text.includes('safe-message'));
  });

for (const value of [
  '"first\\"second;third"',
  "'first\\'second;third'",
  '"first";second;third',
  '"first" ; second;third',
])
  test(`quoted credential value ${value[0]} cannot leak after an escaped quote or semicolon`, () => {
    const { text } = retained(`[ERROR] {"secret2":${value}, "safe":"message"}`);
    for (const fragment of ['first', 'second', 'third'])
      assert.equal(text.includes(fragment), false);
    assert.ok(text.includes('message'));
  });

test('workflow commands are neutralized anywhere in headlines and provider messages', () => {
  for (const line of [
    '[ERROR] prefix ##[set-output name=x;]value ##[stop-commands] ::warning:: end',
    'prefix ##[set-output name=x;]value ##[stop-commands] ::warning:: end [code: 10021]',
  ]) {
    const { text, error } = retained(line);
    assert.equal(text.includes('##['), false);
    assert.equal(text.includes('::'), false);
    assert.ok(text.includes('stop-commands'));
    assert.equal(error.uploadFailure.stderr, undefined);
  }
});

test('short unlabelled values have no redaction guarantee', () => {
  const { text } = retained('[ERROR] Unrecognized tiny-value');
  assert.ok(text.includes('tiny-value'));
});
