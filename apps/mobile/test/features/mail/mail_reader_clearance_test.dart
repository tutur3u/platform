import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mail/data/mail_repository.dart';
import 'package:mobile/features/mail/view/mail_reader.dart';
import 'package:mocktail/mocktail.dart';

import '../../helpers/pump_app.dart';

class _Repository extends Mock implements MailRepository {}

void main() {
  testWidgets('final attachment clears the inherited floating dock', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpApp(
      Builder(
        builder: (context) => MediaQuery(
          data: MediaQuery.of(
            context,
          ).copyWith(padding: const EdgeInsets.only(bottom: 88)),
          child: MailReader(
            repository: _Repository(),
            workspaceId: 'ws',
            mailboxId: 'box',
            thread: false,
            canSend: false,
            fromAddress: 'reader@example.test',
            detail: {
              'id': 'message',
              'subject': 'Dock clearance',
              'fromAddress': 'sender@example.test',
              'unread': false,
              'bodyText': List.filled(
                100,
                'A readable message line.',
              ).join('\n'),
              'attachments': const [
                {
                  'id': 'final',
                  'filename': 'Final attachment.txt',
                  'contentType': 'text/plain',
                },
              ],
            },
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    final scroll = find.byType(ListView).first;
    await tester.drag(scroll, const Offset(0, -10000));
    await tester.pumpAndSettle();
    expect(find.text('Final attachment.txt'), findsOneWidget);
    expect(
      tester.getBottomRight(find.text('Final attachment.txt')).dy,
      lessThanOrEqualTo(844 - 88),
    );
    expect(tester.takeException(), isNull);
  });
}
