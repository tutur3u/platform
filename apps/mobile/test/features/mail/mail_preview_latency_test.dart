import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mail/view/mail_page.dart';

import '../../helpers/pump_app.dart';
import 'mail_preview_harness.dart';

/// Time from tapping an inbox row to readable reader content, in fake time
/// with a fixed 450ms detail latency. "first" is the subject being readable
/// (route transition settled), "body" is the full message body.
Future<({Duration first, Duration body})> _measure(
  WidgetTester tester, {
  required Size size,
  required String warmth,
  required int index,
}) async {
  final cached = warmth == 'cached';
  setMailSurface(tester, size);
  final repository = MailPreviewRepository();
  stubMailPreview(
    repository,
    cachedIds: cached ? {for (var i = 0; i < 12; i++) 'thread-$i'} : const {},
  );
  await tester.pumpApp(
    MailWorkspace(workspaceId: 'ws', repository: repository),
  );
  // Let bootstrap and the list resolve, but not the 450ms warm-up reads.
  await tester.pump();
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 16));
  // "cached": the encrypted store has every thread. "prefetched": nothing is
  // stored, but visible rows were prefetched while the inbox was idle.
  if (warmth != 'cold') await settleMail(tester);
  final row = find.text('Synthetic subject $index').first;
  await tester.tap(row);
  await tester.pump();
  final first = await pumpUntilReadable(
    tester,
    readerText('Synthetic subject $index'),
  );
  final body =
      first + await pumpUntilReadable(tester, readerText('Full body $index'));
  await drain(tester);
  return (first: first, body: body);
}

void main() {
  const phone = Size(390, 844);
  const tablet = Size(1194, 834);

  for (final (name, size) in [('phone', phone), ('tablet', tablet)]) {
    for (final (warmth, index) in [
      ('cold', 0),
      ('cached', 1),
      ('prefetched', 2),
    ]) {
      testWidgets('$name $warmth open never waits for the network to show '
          'the summary', (tester) async {
        final result = await _measure(
          tester,
          size: size,
          warmth: warmth,
          index: index,
        );
        debugPrint(
          'MAIL_LATENCY $name $warmth '
          'first=${result.first.inMilliseconds}ms '
          'body=${result.body.inMilliseconds}ms',
        );
        // The subject never waits for the 450ms detail request; tablets
        // render it in the opening frame.
        expect(result.first.inMilliseconds, lessThan(450));
        if (name == 'tablet') expect(result.first.inMilliseconds, 0);
        // Stored and prefetched bodies arrive with the summary.
        if (warmth != 'cold') expect(result.body, result.first);
      });
    }
  }
}
