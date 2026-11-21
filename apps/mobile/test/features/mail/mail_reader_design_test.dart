import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mail/data/mail_repository.dart';
import 'package:mobile/features/mail/view/mail_reader.dart';
import 'package:mobile/features/mail/view/mail_reader_identity.dart';
import 'package:mocktail/mocktail.dart';

import '../../helpers/design_render_harness.dart';
import '../../helpers/pump_app.dart';

class _Repository extends Mock implements MailRepository {}

void main() {
  setUpAll(DesignRender.loadFonts);
  test('hidden email never supplies initials or fallback name', () {
    expect(
      MailReaderIdentity.visibleName('private@example.test', null, {
        'emailVisible': false,
      }, 'Member'),
      'Member',
    );
    for (final name in [
      'PRIVATE@example.test',
      ' private@example.test ',
      'Name <PRIVATE@example.test>',
    ]) {
      expect(
        MailReaderIdentity.visibleName('private@example.test', name, {
          'emailVisible': false,
        }, 'Member'),
        'Member',
      );
    }
    expect(
      MailReaderIdentity.visibleName('private@example.test', 'Visible name', {
        'emailVisible': false,
      }, 'Member'),
      'Visible name',
    );
  });

  test('avatar URLs permit HTTPS and otherwise retain initials', () {
    for (final value in [
      null,
      '',
      'http://example.test/a.png',
      'data:image/png;base64,AAAA',
      'file:///tmp/a.png',
      '/avatar.png',
    ]) {
      expect(MailReaderIdentity.avatarUrl(value), isNull);
    }
    expect(
      MailReaderIdentity.avatarUrl('https://example.test/a.png'),
      'https://example.test/a.png',
    );
  });

  for (final brightness in Brightness.values) {
    for (final scale in [1.0, 2.0]) {
      testWidgets('${brightness.name} reader at ${scale}x text', (
        tester,
      ) async {
        tester.view.physicalSize = const Size(390, 844);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.reset);
        final repository = _Repository();
        await tester.pumpThemedHome(
          MediaQuery(
            data: MediaQueryData(
              size: const Size(390, 844),
              textScaler: TextScaler.linear(scale),
              padding: const EdgeInsets.only(bottom: 88),
            ),
            child: MailReader(
              repository: repository,
              workspaceId: 'ws',
              mailboxId: 'box',
              thread: false,
              canSend: false,
              fromAddress: 'reader@example.test',
              detail: const {
                'id': 'message',
                'subject': 'helppp',
                'fromName': 'Anh Châu',
                'fromAddress': 'anhchau@example.test',
                'bodyText': 'anh ơi cứu em với :))',
                'unread': false,
                'sentAt': '2026-11-17T13:30:00Z',
                'recipients': [
                  {
                    'kind': 'to',
                    'displayName': 'Phúc Võ',
                    'address': 'phucvo@example.test',
                  },
                ],
                'attachments': [
                  {
                    'id': 'pdf',
                    'filename': 'workspace-notes.pdf',
                    'contentType': 'application/pdf',
                    'sizeBytes': 512000,
                  },
                ],
              },
            ),
          ),
          brightness: brightness,
          wrap: (app) =>
              RepaintBoundary(key: DesignRenderApp.boundaryKey, child: app),
        );
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        expect(find.text('Anh Châu'), findsOneWidget);
        await DesignRender.capture(
          tester,
          'reader-${brightness.name}-${scale}x',
        );
        await tester.tap(find.byKey(const ValueKey('mail-attachments-toggle')));
        await tester.pumpAndSettle();
        expect(find.text('workspace-notes.pdf'), findsOneWidget);
        expect(tester.takeException(), isNull);
        await DesignRender.capture(
          tester,
          'attachments-${brightness.name}-${scale}x',
        );
      });
    }
  }
}
