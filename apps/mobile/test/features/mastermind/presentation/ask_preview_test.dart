import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/presentation/display_names.dart';

import '../../../helpers/mastermind_replies_fixture.dart';

void main() {
  test('a real title leaves the whole ask as the preview', () {
    final item = parsedItem(
      inboxItem(1, title: 'Choose', body: 'First line.\nSecond line.'),
    );
    expect(titleIsFirstAskLine(item), isFalse);
    expect(askPreviewText(item), 'First line.\nSecond line.');
  });

  test(
    'a redacted title is the first line, so the preview starts after it',
    () {
      final item = parsedItem(
        inboxItem(
          1,
          title: 'Mastermind · hub · decision',
          body: 'First line.\nSecond line.\nThird.',
        ),
      );
      expect(titleIsFirstAskLine(item), isTrue);
      expect(askPreviewText(item), 'Second line.\nThird.');
    },
  );

  test('a one-line redacted ask has nothing left to preview', () {
    final item = parsedItem(
      inboxItem(1, title: 'Mastermind · hub · decision', body: 'Only line.'),
    );
    expect(askPreviewText(item), isEmpty);
  });

  test('the Open on Mac stand-in is not previewed', () {
    final item = parsedItem(inboxItem(1, body: 'Open on Mac to read this.'));
    expect(askPreviewText(item), isEmpty);
  });

  test('the spoken summary is one line of at most 200 characters', () {
    expect(spokenAskSummary('a\n\n  b'), 'a b');
    final long = spokenAskSummary('word ' * 200);
    expect(long.runes.length, lessThanOrEqualTo(201));
    expect(long, endsWith('…'));
    expect(spokenAskSummary('x' * 200), 'x' * 200);
  });
}
