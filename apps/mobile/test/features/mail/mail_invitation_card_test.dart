import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mail/data/mail_repository.dart';
import 'package:mobile/features/mail/view/mail_invitation_card.dart';
import 'package:mocktail/mocktail.dart';
import '../../helpers/pump_app.dart';

class _Repository extends Mock implements MailRepository {}

const invitation = {
  'summary': 'Supervisors meeting',
  'attendee': 'guest@example.test',
  'organizer': 'host@example.test',
  'when': '2026-10-02 13:30 (SE Asia Standard Time)',
  'location': 'Original Outlook room',
  'joinUrl': 'https://teams.microsoft.com/meet/synthetic',
};

void main() {
  Widget card(MailRepository repository, {String workspaceId = 'ws'}) =>
      Scaffold(
        body: MailInvitationCard(
          repository: repository,
          workspaceId: workspaceId,
          mailboxId: 'box',
          messageId: 'message',
        ),
      );
  testWidgets(
    'displays real RSVP controls and original identity/location without automatic sends',
    (tester) async {
      final repository = _Repository();
      when(
        () => repository.invitation('ws', 'box', 'message'),
      ).thenAnswer((_) async => invitation);
      await tester.pumpApp(card(repository));
      await tester.pumpAndSettle();
      for (final label in [
        'Accept',
        'Decline',
        'Tentative',
        'Join meeting',
        'Location: Original Outlook room',
        'Reply as guest@example.test to organizer host@example.test',
      ]) {
        expect(find.text(label), findsOneWidget);
      }
      verifyNever(
        () => repository.respondToInvitation(
          any(),
          any(),
          any(),
          response: any(named: 'response'),
          requestId: any(named: 'requestId'),
        ),
      );
    },
  );
  testWidgets('retries uncertain response with the same ID and saved state', (
    tester,
  ) async {
    final repository = _Repository();
    final ids = <String>[];
    when(
      () => repository.invitation('ws', 'box', 'message'),
    ).thenAnswer((_) async => invitation);
    when(
      () => repository.respondToInvitation(
        'ws',
        'box',
        'message',
        response: 'ACCEPTED',
        requestId: any(named: 'requestId'),
      ),
    ).thenAnswer((call) async {
      ids.add(call.namedArguments[#requestId] as String);
      if (ids.length == 1) throw StateError('Synthetic timeout');
      return {'status': 'sent'};
    });
    await tester.pumpApp(card(repository));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Accept'));
    await tester.pumpAndSettle();
    expect(
      find.text(
        'Could not confirm your response. '
        'Retry the same response to check its status.',
      ),
      findsOneWidget,
    );
    await tester.tap(find.text('Accept'));
    await tester.pumpAndSettle();
    expect(ids[0], ids[1]);
    expect(find.text('Response sent: Accept'), findsOneWidget);
    expect(
      tester
          .widget<OutlinedButton>(
            find.ancestor(
              of: find.text('Accept'),
              matching: find.byType(OutlinedButton),
            ),
          )
          .onPressed,
      isNull,
    );
  });
  testWidgets(
    'account/workspace switch and unmount ignore old asynchronous invitation data',
    (tester) async {
      final repository = _Repository();
      final old = Completer<Map<String, dynamic>?>();
      when(
        () => repository.invitation('ws', 'box', 'message'),
      ).thenAnswer((_) => old.future);
      when(
        () => repository.invitation('other', 'box', 'message'),
      ).thenAnswer((_) async => null);
      await tester.pumpApp(card(repository));
      await tester.pump();
      await tester.pumpApp(card(repository, workspaceId: 'other'));
      old.complete(invitation);
      await tester.pumpAndSettle();
      expect(find.text('Accept'), findsNothing);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
    },
  );
  testWidgets('viewer or ordinary calendar attachment has no RSVP controls', (
    tester,
  ) async {
    final repository = _Repository();
    when(
      () => repository.invitation('ws', 'box', 'message'),
    ).thenAnswer((_) async => null);
    await tester.pumpApp(card(repository));
    await tester.pumpAndSettle();
    expect(find.text('Accept'), findsNothing);
  });
}
