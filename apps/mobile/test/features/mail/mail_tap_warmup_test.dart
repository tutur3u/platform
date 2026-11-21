import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mail/view/mail_page.dart';

import '../../helpers/pump_app.dart';
import 'mail_preview_harness.dart';

void main() {
  testWidgets('a cold open starts loading the body as the press lands', (
    tester,
  ) async {
    setMailSurface(tester, const Size(390, 844));
    final repository = MailPreviewRepository();
    final reads = stubMailPreview(repository);
    await tester.pumpApp(
      MailWorkspace(workspaceId: 'ws', repository: repository),
    );
    // Resolve the list but stop before the idle prefetch starts.
    await tester.pump();
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 16));
    expect(reads, isEmpty);

    // A typical tap holds for about 120ms before it releases.
    const press = Duration(milliseconds: 120);
    final gesture = await tester.startGesture(
      tester.getCenter(find.text('Synthetic subject 0').first),
    );
    // The body starts loading once the press holds still for 40ms.
    const hold = Duration(milliseconds: 40);
    await tester.pump();
    expect(reads, isEmpty);
    await tester.pump(hold);
    expect(reads['thread-0'], 1);
    await tester.pump(press - hold);
    await gesture.up();
    await tester.pump();
    final body = await pumpUntilReadable(tester, readerText('Full body 0'));
    debugPrint(
      'MAIL_LATENCY phone cold-press body=${body.inMilliseconds}ms '
      'after release (${press.inMilliseconds}ms press)',
    );
    // The open shares the request the press started instead of issuing one.
    expect(reads['thread-0'], 1);
    // The rest of the 450ms latency, within two 8ms frames.
    expect(
      body.inMilliseconds,
      lessThanOrEqualTo(450 - (press - hold).inMilliseconds + 16),
    );
    await drain(tester);
  });

  testWidgets('a scroll that starts on a row fetches nothing', (tester) async {
    setMailSurface(tester, const Size(390, 844));
    final repository = MailPreviewRepository();
    final reads = stubMailPreview(repository);
    await tester.pumpApp(
      MailWorkspace(workspaceId: 'ws', repository: repository),
    );
    await tester.pump();
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 16));
    final gesture = await tester.startGesture(
      tester.getCenter(find.text('Synthetic subject 1').first),
    );
    await gesture.moveBy(const Offset(0, -40));
    await tester.pump(const Duration(milliseconds: 100));
    await gesture.up();
    await tester.pump();
    expect(reads, isEmpty);
    await drain(tester);
  });
}
