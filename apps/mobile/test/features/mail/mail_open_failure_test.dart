import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/mail/view/mail_page.dart';
import 'package:mobile/features/mail/view/mail_reader.dart';
import 'package:mocktail/mocktail.dart';

import '../../helpers/phone_surface.dart';
import '../../helpers/pump_app.dart';
import 'mail_preview_harness.dart';

void main() {
  usePhoneSurface();

  testWidgets('failed open keeps the reader open with an inline retry', (
    tester,
  ) async {
    final repository = MailPreviewRepository();
    stubMailPreview(repository, threads: 1);
    var attempts = 0;
    var failing = true;
    when(
      () => repository.detail('ws', 'box', 'thread-0', thread: true),
    ).thenAnswer((_) async {
      attempts++;
      if (failing) {
        throw const ApiException(message: 'Unavailable', statusCode: 503);
      }
      return syntheticDetail('thread-0');
    });
    await tester.pumpApp(
      MailWorkspace(workspaceId: 'ws', repository: repository),
    );
    await tester.pumpAndSettle();
    // A failed single-attempt prefetch is not retried in the background.
    await tester.pump(const Duration(seconds: 1));
    final beforeOpen = attempts;
    await tester.tap(find.text('Synthetic subject 0'));
    await tester.pump();
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));
    // The open retried its transient failure once before reporting it.
    expect(attempts - beforeOpen, 2);
    expect(find.byType(MailReader), findsOneWidget);
    expect(readerText('Snippet 0'), findsOneWidget);
    expect(
      find.text('Could not open this message. Please try again.'),
      findsOneWidget,
    );
    expect(find.byType(SnackBar), findsNothing);
    failing = false;
    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();
    expect(readerText('Full body 0'), findsOneWidget);
    expect(
      find.text('Could not open this message. Please try again.'),
      findsNothing,
    );
    expect(attempts - beforeOpen, 3);
    await drain(tester);
  });
}
