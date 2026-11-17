import 'dart:async';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mail/data/mail_repository.dart';
import 'package:mobile/features/mail/view/mail_attachment_tile.dart';
import 'package:mobile/l10n/gen/app_localizations.dart';
import 'package:mocktail/mocktail.dart';

class _Repository extends Mock implements MailRepository {}

void main() {
  test('thumbnail uses known dimensions or safe fallback', () {
    expect(mailAttachmentAspectRatio({'width': 640, 'height': 480}), 4 / 3);
    expect(
      mailAttachmentAspectRatio({
        'contentType': 'image/png; width="800"; height=400',
      }),
      2,
    );
    for (final file in <Map<String, dynamic>>[
      {},
      {'width': 0, 'height': 400},
      {'width': double.infinity, 'height': 400},
    ]) {
      expect(mailAttachmentAspectRatio(file), 3 / 2);
    }
  });

  late _Repository repository;
  setUp(() => repository = _Repository());

  Map<String, dynamic> file({int? size = 100}) => {
    'id': 'file',
    'filename': 'cat.jpg',
    'contentType': 'image/jpeg; name=cat.jpg',
    'sizeBytes': size,
  };

  Widget harness({
    required String workspace,
    required Map<String, dynamic> attachment,
    bool thumbnail = true,
    VoidCallback? onDownload,
  }) => MaterialApp(
    localizationsDelegates: AppLocalizations.localizationsDelegates,
    supportedLocales: AppLocalizations.supportedLocales,
    home: Scaffold(
      body: SizedBox(
        width: 320,
        child: MailAttachmentTile(
          repository: repository,
          workspaceId: workspace,
          mailboxId: 'box',
          messageId: 'message',
          file: attachment,
          loadThumbnail: thumbnail,
          onPreview: () {},
          onDownload: onDownload ?? () {},
        ),
      ),
    ),
  );

  testWidgets('extreme dimension metadata keeps the preview frame bounded', (
    tester,
  ) async {
    final attachment = file()..addAll({'width': 1, 'height': 32768});
    await tester.pumpWidget(
      harness(workspace: 'ws', attachment: attachment, thumbnail: false),
    );
    await tester.pumpAndSettle();
    final frame = tester.getSize(find.byType(AspectRatio));
    expect(frame.height, lessThanOrEqualTo(240));
    expect(frame.height, greaterThanOrEqualTo(80));
    expect(tester.takeException(), isNull);
  });

  testWidgets('failed thumbnail retries the authenticated read', (
    tester,
  ) async {
    var attempts = 0;
    when(
      () => repository.attachment('ws', 'box', 'message', 'file'),
    ).thenAnswer((_) async {
      attempts++;
      throw StateError('offline');
    });
    await tester.pumpWidget(harness(workspace: 'ws', attachment: file()));
    await tester.pumpAndSettle();
    expect(find.text('cat.jpg'), findsOneWidget);
    expect(find.text('Retry'), findsOneWidget);
    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();
    expect(attempts, 2);
  });

  testWidgets('unknown and oversize images retain the download action', (
    tester,
  ) async {
    var downloads = 0;
    for (final size in [null, 5 * 1024 * 1024]) {
      await tester.pumpWidget(
        harness(
          workspace: 'ws',
          attachment: file(size: size),
          onDownload: () => downloads++,
        ),
      );
      await tester.pump();
      expect(find.text('cat.jpg'), findsOneWidget);
      await tester.tap(find.byIcon(Icons.download_outlined));
    }
    expect(downloads, 2);
    verifyNever(() => repository.attachment(any(), any(), any(), any()));
  });

  testWidgets('workspace change rejects the old thumbnail completion', (
    tester,
  ) async {
    final oldRequest = Completer<Uint8List>();
    when(
      () => repository.attachment('old', 'box', 'message', 'file'),
    ).thenAnswer((_) => oldRequest.future);
    await tester.pumpWidget(harness(workspace: 'old', attachment: file()));
    await tester.pumpWidget(
      harness(workspace: 'new', attachment: file(), thumbnail: false),
    );
    oldRequest.complete(Uint8List.fromList([1, 2, 3]));
    await tester.pumpAndSettle();
    expect(find.byType(Image), findsNothing);
    expect(find.text('Retry'), findsNothing);
    expect(find.text('cat.jpg'), findsOneWidget);
  });
}
