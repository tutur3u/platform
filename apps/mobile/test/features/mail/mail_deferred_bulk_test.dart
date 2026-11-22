import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/shell/cubit/shell_mini_nav_cubit.dart';
import 'package:mocktail/mocktail.dart';

import 'mail_deferred_harness.dart';

/// Selection actions and Mark all read while an Archive or Delete is held.
void main() {
  final f = MailDeferredFixture()..register();

  testWidgets('Mark all read leaves another list untouched when the list '
      'changes during its wait', (tester) async {
    final trash = Completer<void>();
    when(f.trashFirst).thenAnswer((_) => trash.future);
    when(
      () => f.repository.markFolderRead('ws', 'box', 'inbox'),
    ).thenAnswer((_) async {});
    await f.mount(tester);
    await f.swipeFirstToTrash(tester);
    await tester.tap(find.byTooltip('Mark all read'));
    await tester.pump();
    await tester.tap(find.byTooltip('Search mail'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), 'second');
    await tester.pump(const Duration(milliseconds: 301));
    await tester.pumpAndSettle();

    f.listFails = true;
    f.trashed.add('First');
    trash.complete();
    await tester.pumpAndSettle();
    verify(() => f.repository.markFolderRead('ws', 'box', 'inbox')).called(1);
    // The search result was never marked read: the request named Inbox.
    expect(f.savedViews.last['query'], 'second');
    expect(f.savedRow('Second')['unread'], isTrue);
    expect(tester.takeException(), isNull);
  });

  testWidgets('Mark all read still reaches its mailbox when another mailbox '
      'is chosen during its wait', (tester) async {
    f.addTeamMailbox();
    final trash = Completer<void>();
    when(f.trashFirst).thenAnswer((_) => trash.future);
    when(() => f.repository.markFolderRead(any(), any(), any())).thenAnswer((
      _,
    ) async {
      f.events.add('read-all');
    });
    final miniNav = ShellMiniNavCubit();
    addTearDown(miniNav.close);
    // The shell keeps its mailbox picker available during the wait.
    final actions = await f.mountShell(tester, miniNav: miniNav);
    await f.swipeFirstToTrash(tester);
    actions.state
        .resolveForLocation(Routes.mail)
        .singleWhere((action) => action.id == 'mail-mark-read')
        .onPressed!();
    await tester.pump();
    miniNav.state
        .resolveForLocation(Routes.mail)!
        .items
        .singleWhere((item) => item.id == 'mailbox')
        .onPressed!();
    await tester.pumpAndSettle();
    await tester.tap(find.text('team@tuturuuu.com').last);
    await tester.pumpAndSettle();
    expect(find.text('Other'), findsOneWidget);
    expect(f.events, isNot(contains('read-all')));

    f.listFails = true;
    f.trashed.add('First');
    trash.complete();
    await tester.pumpAndSettle();
    verify(() => f.repository.markFolderRead('ws', 'box', 'inbox')).called(1);
    // The other mailbox's list keeps its own read state.
    expect(find.text('Other'), findsOneWidget);
    expect(f.savedRow('Other')['unread'], isTrue);
    expect(tester.takeException(), isNull);
  });

  testWidgets('Mark all read waits for a Delete that is still being written', (
    tester,
  ) async {
    final trash = Completer<void>();
    when(f.trashFirst).thenAnswer((_) => trash.future);
    when(
      () => f.repository.markFolderRead('ws', 'box', 'inbox'),
    ).thenAnswer((_) async {});
    await f.mount(tester);
    await f.swipeFirstToTrash(tester);

    await tester.tap(find.byTooltip('Mark all read'));
    await tester.pumpAndSettle();
    verify(f.trashFirst).called(1);
    expect(find.text('Undo'), findsNothing);
    verifyNever(() => f.repository.markFolderRead('ws', 'box', 'inbox'));

    f.trashed.add('First');
    trash.complete();
    await tester.pumpAndSettle();
    verify(() => f.repository.markFolderRead('ws', 'box', 'inbox')).called(1);
    expect(find.text('First'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('a selection action waits for a Delete that is still being '
      'written', (tester) async {
    final trash = Completer<void>();
    when(f.trashFirst).thenAnswer((_) => trash.future);
    Future<void> archiveSecond() =>
        f.repository.bulk('ws', 'box', ['Second'], 'archive', threads: true);
    when(archiveSecond).thenAnswer((_) async {});
    await f.mount(tester);
    await f.swipeFirstToTrash(tester);

    await tester.longPress(find.text('Second'));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Archive'));
    await tester.pumpAndSettle();
    verify(f.trashFirst).called(1);
    verifyNever(archiveSecond);

    f.trashed.addAll(['First', 'Second']);
    trash.complete();
    await tester.pumpAndSettle();
    verify(archiveSecond).called(1);
    expect(find.text('Second'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('Mark all read ends with a reload when a page loaded during '
      'its wait, and returns a row whose Delete failed', (tester) async {
    f.hasMore = true;
    final trash = Completer<void>();
    when(f.trashFirst).thenAnswer((_) => trash.future);
    when(() => f.repository.markFolderRead('ws', 'box', 'inbox')).thenAnswer((
      _,
    ) async {
      f.events.add('read-all');
    });
    await f.mount(tester);
    await f.swipeFirstToTrash(tester);
    await tester.tap(find.byTooltip('Mark all read'));
    await tester.pump();
    await tester.tap(find.text('Load more'));
    await tester.pumpAndSettle();
    expect(f.events, isNot(contains('read-all')));

    trash.completeError(StateError('Failed'));
    await tester.pumpAndSettle();
    expect(f.events.where((event) => event == 'read-all'), hasLength(1));
    expect(f.events.last, 'list');
    // The Delete never reached the server, so the conversation is back.
    expect(find.text('First'), findsWidgets);
    await tester.pump(const Duration(seconds: 6));
    expect(tester.takeException(), isNull);
  });

  for (final selection in [false, true]) {
    testWidgets('${selection ? 'a selection action' : 'Mark all read'} is '
        'dropped when the account changes during its wait', (tester) async {
      var user = 'first-account';
      final trash = Completer<void>();
      when(f.trashFirst).thenAnswer((_) => trash.future);
      await f.mount(tester, currentUserId: () => user);
      await f.swipeFirstToTrash(tester);
      if (selection) {
        await tester.longPress(find.text('Second'));
        await tester.pumpAndSettle();
      }
      await tester.tap(find.byTooltip(selection ? 'Archive' : 'Mark all read'));
      await tester.pump();

      user = 'second-account';
      trash.complete();
      await tester.pumpAndSettle();
      verifyNever(() => f.repository.markFolderRead(any(), any(), any()));
      verifyNever(
        () => f.repository.bulk(
          any(),
          any(),
          any(),
          'archive',
          threads: any(named: 'threads'),
        ),
      );
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('a held Delete that lands keeps a selection in progress', (
    tester,
  ) async {
    when(f.trashFirst).thenAnswer((_) async => f.trashed.add('First'));
    await f.mount(tester);
    await f.swipeFirstToTrash(tester);
    await tester.longPress(find.text('Second'));
    await tester.pumpAndSettle();
    expect(find.byTooltip('Archive'), findsOneWidget);

    await tester.pump(const Duration(seconds: 4));
    await tester.pumpAndSettle();
    verify(f.trashFirst).called(1);
    expect(find.byTooltip('Archive'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
