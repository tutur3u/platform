import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mail/view/mail_reader.dart';
import 'package:mobile/features/mail/view/mail_settings_page.dart';
import 'package:mocktail/mocktail.dart';

import 'mail_deferred_harness.dart';

/// Archive and Delete held through their Undo window: Undo, failed writes,
/// account and access changes.
void main() {
  final f = MailDeferredFixture()..register();

  testWidgets('Undo after deleting a conversation read from the Unread filter '
      'keeps it out of that filter', (tester) async {
    when(
      () =>
          f.repository.changeState('ws', 'box', 'First', 'trash', thread: true),
    ).thenAnswer((_) async => f.trashed.add('First'));
    final actions = await f.mountShell(tester);
    await tester.tap(find.byKey(const ValueKey('mail-quick-filter-unread')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('First'));
    await tester.pumpAndSettle();
    expect(find.byType(MailReader), findsOneWidget);
    // Opening the conversation marks it read on the server.
    f.read.add('First');

    await f.deleteFromReader(tester, actions);
    await tester.tap(find.text('Undo'));
    await tester.pumpAndSettle();

    verifyNever(
      () =>
          f.repository.changeState('ws', 'box', 'First', 'trash', thread: true),
    );
    // The conversation is read, so the Unread result does not list it.
    expect(find.text('First'), findsNothing);
    expect(find.text('Second'), findsOneWidget);
    expect(
      (f.savedViews.last['items'] as List).map((item) => (item as Map)['id']),
      ['Second'],
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets('Undo after deleting a conversation unstarred in the reader '
      'keeps it out of the Starred filter', (tester) async {
    f.starred.add('First');
    when(
      () => f.repository.changeState(
        'ws',
        'box',
        'First',
        'unstar',
        thread: true,
      ),
    ).thenAnswer((_) async => f.starred.remove('First'));
    final actions = await f.mountShell(tester);
    final chip = find.byKey(const ValueKey('mail-quick-filter-starred'));
    await tester.ensureVisible(chip);
    await tester.pumpAndSettle();
    await tester.tap(chip);
    await tester.pumpAndSettle();
    await tester.tap(find.text('First'));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Remove star'));
    await tester.pumpAndSettle();

    await f.deleteFromReader(tester, actions);
    await tester.tap(find.text('Undo'));
    // The row is not put back even before the list reloads.
    await tester.pump();
    expect(find.text('First'), findsNothing);
    await tester.pumpAndSettle();
    expect(find.text('First'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('Undo reloads the list after returning a swiped row', (
    tester,
  ) async {
    await f.mount(tester);
    await f.swipeFirstToTrash(tester);
    final loads = f.events.length;
    await tester.tap(find.text('Undo'));
    await tester.pump();
    expect(find.text('First'), findsOneWidget);
    await tester.pumpAndSettle();
    expect(f.events.length, greaterThan(loads));
    expect(find.text('First'), findsOneWidget);
    verifyNever(f.trashFirst);
  });

  testWidgets('a Delete that fails returns its row even when the reload '
      'fails too', (tester) async {
    when(f.trashFirst).thenAnswer((_) async => throw StateError('Failed'));
    await f.mount(tester);
    await f.swipeFirstToTrash(tester);

    f.listFails = true;
    await tester.pump(const Duration(seconds: 4));
    await tester.pumpAndSettle();
    verify(f.trashFirst).called(1);
    expect(find.text('First'), findsOneWidget);
    expect(f.savedRow('First')['subject'], 'First');
    await tester.pump(const Duration(seconds: 6));
    expect(tester.takeException(), isNull);
  });

  testWidgets("a Delete that fails returns its row while another mailbox's "
      'write is still on its way', (tester) async {
    f.addTeamMailbox();
    final trashMine = Completer<void>();
    final trashTeam = Completer<void>();
    when(f.trashFirst).thenAnswer((_) => trashMine.future);
    when(
      () => f.repository.bulk('ws', 'team', ['Other'], 'trash', threads: true),
    ).thenAnswer((_) => trashTeam.future);
    Future<void> switchTo(String address) async {
      await tester.tap(find.byTooltip('Mailbox').first);
      await tester.pumpAndSettle();
      await tester.tap(find.text(address).last);
      await tester.pumpAndSettle();
    }

    await f.mount(tester);
    await f.swipeFirstToTrash(tester);
    await switchTo('team@tuturuuu.com');
    verify(f.trashFirst).called(1);
    await tester.drag(find.text('Other'), const Offset(260, 0));
    await tester.pumpAndSettle();
    await switchTo('me@tuturuuu.com');
    expect(find.text('First'), findsNothing);

    f.listFails = true;
    final requests = f.events.length;
    trashMine.completeError(StateError('Failed'));
    await tester.pumpAndSettle();
    expect(find.text('First'), findsOneWidget);
    // This mailbox asked for its list without waiting on the other's write.
    expect(f.events.length, greaterThan(requests));
    await tester.pump(const Duration(seconds: 6));
    trashTeam.complete();
    await tester.pumpAndSettle();
    expect(find.text('First'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('Undo returns a row taken from a filter chosen while the split '
      'reader was open', (tester) async {
    tester.view.physicalSize = const Size(1194, 834);
    f.starred.add('First');
    Future<void> archiveFirst() =>
        f.repository.changeState('ws', 'box', 'First', 'archive', thread: true);
    await f.mount(tester);
    await tester.tap(find.text('First'));
    await tester.pumpAndSettle();
    expect(find.byType(MailReader), findsOneWidget);
    f.read.add('First');
    final chip = find.byKey(const ValueKey('mail-quick-filter-starred'));
    await tester.ensureVisible(chip);
    await tester.pumpAndSettle();
    await tester.tap(chip);
    await tester.pumpAndSettle();
    expect(find.byType(MailReader), findsOneWidget);

    await tester.tap(
      find.descendant(
        of: find.byType(MailReader),
        matching: find.byTooltip('Archive'),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('First'), findsNothing);

    f.listFails = true;
    await tester.tap(find.text('Undo'));
    await tester.pumpAndSettle();
    verifyNever(archiveFirst);
    expect(find.text('First'), findsOneWidget);
    expect(f.savedRow('First')['starred'], isTrue);
    expect(tester.takeException(), isNull);
  });

  testWidgets('Undo after the automatic read failed returns the row unread', (
    tester,
  ) async {
    f.detailUnread = true;
    when(
      () => f.repository.changeState(
        'ws',
        'box',
        'First',
        'mark_read',
        thread: true,
      ),
    ).thenAnswer((_) async => throw StateError('Failed'));
    final actions = await f.mountShell(tester);
    await tester.tap(find.text('First'));
    await tester.pumpAndSettle();
    await f.deleteFromReader(tester, actions);

    f.listFails = true;
    await tester.tap(find.text('Undo'));
    await tester.pumpAndSettle();
    expect(find.text('First'), findsOneWidget);
    expect(f.savedRow('First')['unread'], isTrue);
    expect(tester.takeException(), isNull);
  });

  testWidgets('a held Delete is dropped when the account changes', (
    tester,
  ) async {
    var user = 'first-account';
    await f.mount(tester, currentUserId: () => user);
    await f.swipeFirstToTrash(tester);

    user = 'second-account';
    await tester.pump(const Duration(seconds: 4));
    await tester.pumpAndSettle();
    verifyNever(f.trashFirst);
    expect(tester.takeException(), isNull);
  });

  testWidgets('a held Delete is dropped when Mail closes after the account '
      'changed', (tester) async {
    var user = 'first-account';
    await f.mount(tester, currentUserId: () => user);
    await f.swipeFirstToTrash(tester);

    user = 'second-account';
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump(const Duration(seconds: 4));
    verifyNever(f.trashFirst);
    expect(tester.takeException(), isNull);
  });

  testWidgets('hiding the app submits a held Delete at once', (tester) async {
    when(f.trashFirst).thenAnswer((_) async => f.trashed.add('First'));
    await f.mount(tester);
    await f.swipeFirstToTrash(tester);

    addTearDown(
      () => tester.binding.handleAppLifecycleStateChanged(
        AppLifecycleState.resumed,
      ),
    );
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
    await tester.pump();
    verify(f.trashFirst).called(1);
    // Frames, and with them the control's exit, resume with the app.
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();
    expect(find.text('Undo'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('feedback for a write that finishes behind Mail settings shows '
      'on return', (tester) async {
    final markRead = Completer<void>();
    when(
      () =>
          f.repository.bulk('ws', 'box', ['First'], 'mark_read', threads: true),
    ).thenAnswer((_) => markRead.future);
    when(
      () => f.repository.settings('ws', 'box'),
    ).thenAnswer((_) async => {'settings': <String, dynamic>{}});
    await f.mount(tester);
    await tester.drag(find.text('First'), const Offset(-260, 0));
    await tester.pump();
    await tester.tap(find.byTooltip('Mail settings'));
    await tester.pumpAndSettle();
    expect(find.byType(MailSettingsPage), findsOneWidget);

    f.read.add('First');
    markRead.complete();
    await tester.pump();
    expect(find.text('Undo'), findsNothing);

    await tester.pageBack();
    await tester.pumpAndSettle();
    expect(find.byType(MailSettingsPage), findsNothing);
    expect(find.text('Undo'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('revoked access cancels a Delete waiting on its Undo window', (
    tester,
  ) async {
    final revoked = ValueNotifier<String?>(null);
    addTearDown(revoked.dispose);
    when(() => f.repository.accessRevoked).thenReturn(revoked);
    await f.mount(tester);
    await f.swipeFirstToTrash(tester);

    revoked.value = 'ws';
    await tester.pumpAndSettle();
    expect(find.text('Undo'), findsNothing);
    await tester.pump(const Duration(seconds: 4));
    await tester.pumpAndSettle();
    verifyNever(f.trashFirst);
    verify(() => f.repository.denyAccess('ws')).called(1);
    expect(tester.takeException(), isNull);
  });

  testWidgets('swiping the open conversation to Delete closes its split '
      'pane', (tester) async {
    tester.view.physicalSize = const Size(1194, 834);
    await f.mount(tester);
    await tester.tap(find.text('First'));
    await tester.pumpAndSettle();
    expect(find.byType(MailReader), findsOneWidget);

    await tester.drag(find.text('First').first, const Offset(260, 0));
    await tester.pumpAndSettle();
    expect(find.text('Undo'), findsOneWidget);
    // No reader is left to change the conversation ahead of the held write.
    expect(find.byType(MailReader), findsNothing);
    verifyNever(f.trashFirst);
    await tester.tap(find.text('Undo'));
    await tester.pumpAndSettle();
    expect(find.text('First'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('a held Delete stays hidden through a refresh after earlier '
      'feedback for the same conversation is replaced', (tester) async {
    when(
      () =>
          f.repository.bulk('ws', 'box', ['First'], 'mark_read', threads: true),
    ).thenAnswer((_) async => f.read.add('First'));
    when(f.trashFirst).thenAnswer((_) async => f.trashed.add('First'));
    await f.mount(tester);
    await tester.drag(find.text('First'), const Offset(-260, 0));
    await tester.pumpAndSettle();
    expect(find.text('Undo'), findsOneWidget);
    await f.swipeFirstToTrash(tester);

    await tester.fling(find.text('Second'), const Offset(0, 400), 1200);
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.text('First'), findsNothing);
    verifyNever(f.trashFirst);
    await tester.pump(const Duration(seconds: 4));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });

  testWidgets('a held Delete is cancelled when the list reports a newer '
      'message in its conversation', (tester) async {
    await f.mount(tester);
    await f.swipeFirstToTrash(tester);

    f.activity['First'] = '2026-11-22T08:00:02.000Z';
    await tester.fling(find.text('Second'), const Offset(0, 400), 1200);
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.text('Kept: a new message arrived'), findsOneWidget);
    expect(find.text('Undo'), findsNothing);
    expect(find.text('First'), findsOneWidget);
    await tester.pump(const Duration(seconds: 6));
    await tester.pumpAndSettle();
    verifyNever(f.trashFirst);
    expect(tester.takeException(), isNull);
  });

  testWidgets('a held Delete from a reader opened without a row time is '
      'cancelled when the list reports a newer message', (tester) async {
    f.rowsOmitActivity = true;
    final actions = await f.mountShell(tester);
    await tester.tap(find.text('First'));
    await tester.pumpAndSettle();
    await f.deleteFromReader(tester, actions);
    expect(find.text('Undo'), findsOneWidget);

    f
      ..rowsOmitActivity = false
      ..activity['First'] = '2026-11-22T08:00:02.000Z';
    await tester.fling(find.text('Second'), const Offset(0, 400), 1200);
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.text('Kept: a new message arrived'), findsOneWidget);
    expect(find.text('First'), findsOneWidget);
    await tester.pump(const Duration(seconds: 6));
    await tester.pumpAndSettle();
    verifyNever(
      () =>
          f.repository.changeState('ws', 'box', 'First', 'trash', thread: true),
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets('a list response already on its way when a Delete is held '
      'still cancels it for a newer message', (tester) async {
    await f.mount(tester);
    f.listGate = Completer<void>();
    await tester.fling(find.text('Second'), const Offset(0, 400), 1200);
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));
    await tester.drag(find.text('First'), const Offset(260, 0));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.text('Undo'), findsOneWidget);
    expect(find.text('First'), findsNothing);

    f.activity['First'] = '2026-11-22T08:00:02.000Z';
    f.listGate!.complete();
    f.listGate = null;
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.text('Kept: a new message arrived'), findsOneWidget);
    expect(find.text('First'), findsOneWidget);
    await tester.pump(const Duration(seconds: 6));
    await tester.pumpAndSettle();
    verifyNever(f.trashFirst);
    expect(tester.takeException(), isNull);
  });

  for (final meanwhile in ['nothing', 'another opened', 'folder changed']) {
    testWidgets('reopening a conversation waits for its held Archive to land '
        '(meanwhile: $meanwhile)', (tester) async {
      tester.view.physicalSize = const Size(1194, 834);
      f.starred.add('First');
      final archive = Completer<void>();
      Future<void> archiveFirst() => f.repository.changeState(
        'ws',
        'box',
        'First',
        'archive',
        thread: true,
      );
      when(archiveFirst).thenAnswer((_) => archive.future);
      await f.mount(tester);
      await tester.tap(find.text('First'));
      await tester.pumpAndSettle();
      // The Starred folder keeps an archived conversation in its list.
      await tester.tap(find.byTooltip('Inbox').first);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Starred').last);
      await tester.pumpAndSettle();
      await tester.tap(
        find.descendant(
          of: find.byType(MailReader),
          matching: find.byTooltip('Archive'),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.byType(MailReader), findsNothing);
      verifyNever(archiveFirst);

      await tester.tap(find.text('First'));
      await tester.pumpAndSettle();
      verify(archiveFirst).called(1);
      expect(find.byType(MailReader), findsNothing);
      if (meanwhile == 'another opened') {
        await tester.tap(find.text('Second'));
        await tester.pumpAndSettle();
      } else if (meanwhile == 'folder changed') {
        await tester.tap(find.byTooltip('Starred').first);
        await tester.pumpAndSettle();
        await tester.tap(find.text('Drafts').last);
        await tester.pumpAndSettle();
      }
      archive.complete();
      await tester.pumpAndSettle();
      if (meanwhile == 'folder changed') {
        // The row belonged to another folder: nothing opens in Drafts.
        expect(find.byType(MailReader), findsNothing);
        verifyNever(
          () => f.repository.detail('ws', 'box', 'First', thread: false),
        );
      } else {
        // A conversation opened during the wait keeps the pane.
        expect(
          tester.widget<MailReader>(find.byType(MailReader)).summary?['id'],
          meanwhile == 'another opened' ? 'Second' : 'First',
        );
      }
      expect(tester.takeException(), isNull);
    });
  }
}
