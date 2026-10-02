import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mail/data/mail_repository.dart';
import 'package:mobile/features/mail/models/mail_calendar_link_preview.dart';
import 'package:mobile/features/mail/view/mail_calendar_link.dart';
import 'package:mocktail/mocktail.dart';
import '../../helpers/pump_app.dart';

class _Repository extends Mock implements MailRepository {}

const ws = '11111111-1111-4111-8111-111111111111';
const event = '22222222-2222-4222-8222-222222222222';
const url = 'https://calendar.tuturuuu.com/en/$ws?eventId=$event';
Map<String, dynamic> preview() => {
  'receipt': 'synthetic-receipt',
  'invitation': {
    'organizer': 'host@example.test',
    'attendee': 'guest@example.test',
  },
  'original': {
    'summary': 'Outlook invitation',
    'when': 'Original time',
    'location': 'Original Outlook room',
    'joinUrl': 'https://meet.google.com/synthetic',
  },
  'target': {
    'identity': {
      'workspaceId': ws,
      'eventId': event,
      'actorUserId': 'actor',
      'accountOwnerId': 'account-row',
      'iCalUid': 'hold-uid',
      'occurrence': null,
    },
    'title': 'Private hold',
    'accountLabel': 'Personal',
    'organizer': 'self@example.test',
    'start': '2026-10-02T13:30:00+07:00',
    'end': '2026-10-02T15:00:00+07:00',
    'location': 'Hold room',
    'joinUrl': 'https://teams.microsoft.com/meet/synthetic',
    'authority': {'attendees': <Map<String, dynamic>>[]},
  },
};
Widget card(MailRepository repository, {String workspaceId = 'mail-ws'}) =>
    Scaffold(
      body: SingleChildScrollView(
        child: MailCalendarLink(
          repository: repository,
          workspaceId: workspaceId,
          mailboxId: 'box',
          messageId: 'message',
        ),
      ),
    );
Future<void> tap(WidgetTester tester, String text) async {
  await tester.ensureVisible(find.text(text));
  await tester.tap(find.text(text));
  await tester.pump();
}

Future<void> showPreview(WidgetTester tester) async {
  await tester.enterText(find.byType(TextField), url);
  await tap(tester, 'Preview link');
  await tester.pumpAndSettle();
}

void main() {
  setUpAll(() => registerFallbackValue(<String, dynamic>{}));
  late _Repository repository;
  setUp(() {
    repository = _Repository();
    when(
      () => repository.calendarLink(any(), any(), any()),
    ).thenAnswer((_) async => {'target': null, 'association': null});
    when(
      () => repository.previewCalendarLink(any(), any(), any(), any()),
    ).thenAnswer((_) async => {'preview': preview()});
    when(
      () => repository.confirmCalendarLink(any(), any(), any(), any()),
    ).thenAnswer((_) async => {'status': 'linked'});
  });
  test('parses an explicit Calendar reference and preserves its receipt', () {
    expect(parseMailCalendarEventUrl(url), {
      'calendarWorkspaceId': ws,
      'eventId': event,
    });
    for (final value in [
      'https://evil.example.test/en/$ws?eventId=$event',
      'https://calendar.tuturuuu.com/$ws',
      'https://calendar.tuturuuu.com/$ws?eventId=$event&eventId=$event',
    ]) {
      expect(parseMailCalendarEventUrl(value), isNull);
    }
    final model = MailCalendarLinkPreview.fromJson(preview());
    expect(model.selection, {
      'calendarWorkspaceId': ws,
      'eventId': event,
      'receipt': 'synthetic-receipt',
    });
    expect(model.invitation['organizer'], 'host@example.test');
  });
  testWidgets(
    'shows both authorities, separate join actions and cancel without writes',
    (tester) async {
      await tester.pumpApp(card(repository));
      await tester.pumpAndSettle();
      await showPreview(tester);
      expect(find.text('Original Outlook room'), findsOneWidget);
      expect(find.text('Hold room'), findsOneWidget);
      expect(find.text('Join meeting'), findsNWidgets(2));
      verifyNever(
        () => repository.confirmCalendarLink(any(), any(), any(), any()),
      );
      await tap(tester, 'Cancel');
      expect(find.text('Confirm link'), findsNothing);
    },
  );
  testWidgets(
    'disables pending confirm and retries its receipt after network failure',
    (tester) async {
      final pending = Completer<Map<String, dynamic>>();
      when(
        () => repository.confirmCalendarLink(any(), any(), any(), any()),
      ).thenAnswer((_) => pending.future);
      await tester.pumpApp(card(repository));
      await tester.pumpAndSettle();
      await showPreview(tester);
      await tap(tester, 'Confirm link');
      final button = tester.widget<FilledButton>(
        find.widgetWithText(FilledButton, 'Confirm link'),
      );
      expect(button.onPressed, isNull);
      pending.completeError(Exception('Synthetic network failure'));
      await tester.pumpAndSettle();
      expect(
        find.text('Unable to update the link. Try again.'),
        findsOneWidget,
      );
      when(
        () => repository.confirmCalendarLink(any(), any(), any(), any()),
      ).thenAnswer((_) async => {'status': 'linked'});
      await tap(tester, 'Confirm link');
      await tester.pumpAndSettle();
      final calls = verify(
        () => repository.confirmCalendarLink(
          'mail-ws',
          'box',
          'message',
          captureAny(),
        ),
      ).captured;
      expect(calls.length, 2);
      expect(calls.first, calls.last);
      expect(find.text('Calendar event linked'), findsOneWidget);
    },
  );
  testWidgets('requires a new preview after a changed authority', (
    tester,
  ) async {
    when(
      () => repository.confirmCalendarLink(any(), any(), any(), any()),
    ).thenAnswer((_) async => {'status': 'changed'});
    await tester.pumpApp(card(repository));
    await tester.pumpAndSettle();
    await showPreview(tester);
    await tap(tester, 'Confirm link');
    await tester.pumpAndSettle();
    expect(
      find.text('The invitation or event changed. Preview again.'),
      findsOneWidget,
    );
    expect(find.text('Confirm link'), findsNothing);
  });
  testWidgets(
    'discards delayed old-scope preview after workspace change and unmount',
    (tester) async {
      final pending = Completer<Map<String, dynamic>>();
      when(
        () => repository.previewCalendarLink(any(), any(), any(), any()),
      ).thenAnswer((_) => pending.future);
      final scope = ValueNotifier('mail-ws');
      addTearDown(scope.dispose);
      await tester.pumpApp(
        ValueListenableBuilder(
          valueListenable: scope,
          builder: (context, value, child) =>
              card(repository, workspaceId: value),
        ),
      );
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField), url);
      await tap(tester, 'Preview link');
      scope.value = 'other-ws';
      await tester.pumpAndSettle();
      pending.complete({'preview': preview()});
      await tester.pumpAndSettle();
      expect(find.text('Confirm link'), findsNothing);
      expect(
        tester.widget<TextField>(find.byType(TextField)).controller?.text,
        '',
      );
      await tester.pumpWidget(const SizedBox());
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'discards old repository preview when the same message uses a new client',
    (tester) async {
      final pending = Completer<Map<String, dynamic>>();
      when(
        () => repository.previewCalendarLink(any(), any(), any(), any()),
      ).thenAnswer((_) => pending.future);
      final replacement = _Repository();
      when(
        () => replacement.calendarLink(any(), any(), any()),
      ).thenAnswer((_) async => {'target': null, 'association': null});
      final active = ValueNotifier<MailRepository>(repository);
      addTearDown(active.dispose);
      await tester.pumpApp(
        ValueListenableBuilder<MailRepository>(
          valueListenable: active,
          builder: (context, value, child) => card(value),
        ),
      );
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField), url);
      await tap(tester, 'Preview link');
      active.value = replacement;
      await tester.pumpAndSettle();
      pending.complete({'preview': preview()});
      await tester.pumpAndSettle();
      expect(find.text('Confirm link'), findsNothing);
      expect(
        tester.widget<TextField>(find.byType(TextField)).controller?.text,
        '',
      );
      verify(
        () => replacement.calendarLink('mail-ws', 'box', 'message'),
      ).called(1);
      verifyNever(
        () => replacement.confirmCalendarLink(any(), any(), any(), any()),
      );
    },
  );
  testWidgets('unlinks only the saved association receipt', (tester) async {
    when(() => repository.calendarLink(any(), any(), any())).thenAnswer(
      (_) async => {
        'target': null,
        'association': {'receipt': 'saved-receipt'},
      },
    );
    when(
      () => repository.unlinkCalendarLink(any(), any(), any(), any()),
    ).thenAnswer((_) async => {'status': 'unlinked'});
    await tester.pumpApp(card(repository));
    await tester.pumpAndSettle();
    await tap(tester, 'Remove link');
    await tester.pumpAndSettle();
    verify(
      () => repository.unlinkCalendarLink(
        'mail-ws',
        'box',
        'message',
        'saved-receipt',
      ),
    ).called(1);
    verifyNever(
      () => repository.confirmCalendarLink(any(), any(), any(), any()),
    );
  });

  testWidgets('ignores a delayed initial lookup after link confirmation', (
    tester,
  ) async {
    final oldRead = Completer<Map<String, dynamic>>();
    var reads = 0;
    when(() => repository.calendarLink(any(), any(), any())).thenAnswer((_) {
      reads++;
      return reads == 1
          ? oldRead.future
          : Future.value({
              'target': {
                'title': 'New linked target',
                'accountLabel': 'Personal',
              },
              'association': {'receipt': 'new-link'},
            });
    });
    await tester.pumpApp(card(repository));
    await tester.pump();
    await showPreview(tester);
    await tap(tester, 'Confirm link');
    await tester.pumpAndSettle();
    expect(find.text('New linked target · Personal'), findsOneWidget);
    oldRead.complete({'target': null, 'association': null});
    await tester.pumpAndSettle();
    expect(find.text('New linked target · Personal'), findsOneWidget);
  });
  testWidgets('ignores confirmation completion after unmount', (tester) async {
    final pending = Completer<Map<String, dynamic>>();
    when(
      () => repository.confirmCalendarLink(any(), any(), any(), any()),
    ).thenAnswer((_) => pending.future);
    await tester.pumpApp(card(repository));
    await tester.pumpAndSettle();
    await showPreview(tester);
    await tap(tester, 'Confirm link');
    await tester.pumpWidget(const SizedBox());
    pending.complete({'status': 'linked'});
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    verify(
      () => repository.calendarLink('mail-ws', 'box', 'message'),
    ).called(1);
  });
}
