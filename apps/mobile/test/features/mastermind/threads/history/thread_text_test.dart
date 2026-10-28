import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/threads/history/thread_text.dart';

List<Object> _shape(String text) => [
  for (final run in threadTextRuns(text))
    switch (run) {
      PlainRun(:final text) => text,
      RedactionRun(:final kind, :final host) => (kind, host),
    },
];

void main() {
  test('plain text stays one run', () {
    expect(_shape('Ready for review.'), ['Ready for review.']);
  });

  test('hub tokens become placeholders', () {
    expect(
      _shape('Edited ‹path› and ‹link: github.com›, key ‹secret withheld›.'),
      [
        'Edited ',
        (RedactionKind.path, null),
        ' and ',
        (RedactionKind.link, 'github.com'),
        ', key ',
        (RedactionKind.secret, null),
        '.',
      ],
    );
    expect(_shape('‹id›‹email›‹number›'), [
      (RedactionKind.id, null),
      (RedactionKind.email, null),
      (RedactionKind.number, null),
    ]);
  });

  test('a link host that is not a bare host label is dropped', () {
    expect(_shape('‹link: https://evil.example/x›'), [
      (RedactionKind.link, null),
    ]);
  });

  test('an unknown token never shows its contents', () {
    expect(_shape('see ‹/Users/me/secret.txt›'), [
      'see ',
      (RedactionKind.other, null),
    ]);
  });

  test('invisible and bidi control characters are removed', () {
    expect(_shape('a\u202Eb\u200Bc\u0007d\ne'), ['abcd\ne']);
  });
}
