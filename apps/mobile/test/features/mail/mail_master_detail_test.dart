import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/mail/data/mail_push_destination.dart';
import 'package:mobile/features/mail/view/mail_page.dart';
import 'package:mobile/features/mail/view/mail_primary_action_preference.dart';
import 'package:mobile/features/mail/view/mail_reader.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_title_override_cubit.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../helpers/pump_app.dart';
import 'mail_preview_harness.dart';

const _tablet = Size(1194, 834);
const _portrait = Size(820, 1180);
const _phone = Size(390, 844);
const _empty = 'Select a conversation';

/// Mounts a stubbed inbox and returns its live per-thread detail read counts.
Future<Map<String, int>> _mount(
  WidgetTester tester, {
  Size size = _tablet,
  int threads = 12,
}) async {
  setMailSurface(tester, size);
  final repository = MailPreviewRepository();
  final reads = stubMailPreview(repository, threads: threads);
  await tester.pumpApp(
    MailWorkspace(workspaceId: 'ws', repository: repository),
  );
  // Bootstrap and the list resolve; prefetches are still pending.
  await tester.pump();
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 16));
  return reads;
}

Future<void> _resize(WidgetTester tester, Size size) async {
  tester.view.physicalSize = size;
  for (var i = 0; i < 4; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

bool _readable(String text) =>
    find.text(text).hitTestable().evaluate().isNotEmpty;

void main() {
  testWidgets('split reader retains its only primary Reply control', (
    tester,
  ) async {
    setMailSurface(tester, _tablet);
    final preference = MailPrimaryActionPreference.instance;
    final previous = preference.value;
    SharedPreferences.setMockInitialValues({
      MailPrimaryActionPreference.storageKey: 'archive',
    });
    preference.value = MailPrimaryAction.archive;
    addTearDown(() => preference.value = previous);
    await tester.pumpApp(
      AppMasterDetail(
        master: const SizedBox(),
        emptyDetail: const SizedBox(),
        detail: MailReader(
          repository: MailPreviewRepository(),
          workspaceId: 'ws',
          mailboxId: 'box',
          thread: false,
          canSend: true,
          fromAddress: 'me@example.invalid',
          resolvePeople: (_, _) async => {},
          detail: const {
            'id': 'm',
            'subject': 'Reply available',
            'fromAddress': 'sender@example.invalid',
            'bodyText': 'Message body',
            'unread': false,
          },
        ),
      ),
    );
    await tester.pumpAndSettle();
    // The pane toolbar holds the only Reply beside the default action;
    // Delete lives in More.
    expect(find.byTooltip('Reply'), findsOneWidget);
    expect(find.byTooltip('Archive'), findsOneWidget);
    expect(find.byTooltip('Delete'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  for (final (name, size) in [
    ('landscape', _tablet),
    ('portrait', _portrait),
  ]) {
    testWidgets('$name tablet shows the list beside the reading pane', (
      tester,
    ) async {
      await _mount(tester, size: size);
      expect(find.text(_empty), findsOneWidget);
      await tester.tap(find.text('Synthetic subject 1'));
      await tester.pump();
      // The opening frame renders the row summary beside the list.
      expect(readerText('Synthetic subject 1'), findsOneWidget);
      expect(readerText('Snippet 1'), findsOneWidget);
      expect(_readable('Synthetic subject 0'), isTrue);
      await tester.pump(const Duration(milliseconds: 500));
      expect(readerText('Full body 1'), findsOneWidget);
      expect(find.text(_empty), findsNothing);
      await drain(tester);
    });
  }

  testWidgets('compact phones keep the pushed reader', (tester) async {
    await _mount(tester, size: _phone);
    expect(find.text(_empty), findsNothing);
    await tester.tap(find.text('Synthetic subject 1'));
    await tester.pumpAndSettle();
    expect(readerText('Full body 1'), findsOneWidget);
    expect(_readable('Synthetic subject 0'), isFalse);
    await tester.tap(find.byType(BackButton));
    await tester.pumpAndSettle();
    expect(find.byType(MailReader), findsNothing);
    expect(_readable('Synthetic subject 0'), isTrue);
    await drain(tester);
  });

  testWidgets('the open conversation follows rotation both ways', (
    tester,
  ) async {
    await _mount(tester);
    await tester.tap(find.text('Synthetic subject 2'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
    expect(readerText('Full body 2'), findsOneWidget);

    await _resize(tester, _phone);
    await tester.pumpAndSettle();
    // Compact: the same conversation is now a pushed reader over the list.
    expect(find.byType(MailReader), findsOneWidget);
    expect(_readable('Full body 2'), isTrue);
    expect(_readable('Synthetic subject 0'), isFalse);

    await _resize(tester, _tablet);
    // Split again: the route folds back into the pane, still selected.
    expect(find.byType(MailReader), findsOneWidget);
    expect(_readable('Full body 2'), isTrue);
    expect(_readable('Synthetic subject 0'), isTrue);
    await drain(tester);
  });

  testWidgets('Back closes the pane before it may leave Mail', (tester) async {
    await _mount(tester);
    await tester.tap(find.text('Synthetic subject 1'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.byType(MailReader), findsOneWidget);
    await tester.binding.handlePopRoute();
    await tester.pump();
    expect(find.byType(MailReader), findsNothing);
    expect(find.text(_empty), findsOneWidget);
    expect(_readable('Synthetic subject 1'), isTrue);
    await drain(tester);
  });

  testWidgets('Escape closes the pane from the keyboard', (tester) async {
    await _mount(tester);
    await tester.tap(find.text('Synthetic subject 1'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
    await tester.sendKeyEvent(LogicalKeyboardKey.escape);
    await tester.pump();
    expect(find.byType(MailReader), findsNothing);
    expect(find.text(_empty), findsOneWidget);
    await drain(tester);
  });

  testWidgets('a notification deep link opens its pane on tablets', (
    tester,
  ) async {
    const mailbox = '00000000-0000-4000-8000-000000000001';
    const thread = 'thread-3';
    setMailSurface(tester, _tablet);
    final repository = MailPreviewRepository();
    stubMailPreview(repository, mailboxId: mailbox);
    await tester.pumpApp(
      MailWorkspace(
        workspaceId: 'ws',
        repository: repository,
        destination: const MailPushDestination(
          userId: '00000000-0000-4000-8000-000000000002',
          mailboxId: mailbox,
          threadId: thread,
          notificationId: '00000000-0000-4000-8000-000000000003',
        ),
      ),
    );
    for (var i = 0; i < 8; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    expect(readerText('Full body 3'), findsOneWidget);
    expect(_readable('Synthetic subject 0'), isTrue);
    await drain(tester);
  });

  testWidgets('prefetch is bounded and drops rows that scrolled away', (
    tester,
  ) async {
    final reads = await _mount(tester, threads: 40);
    // Debounce plus one batch: two requests run, the rest are queued.
    await tester.pump(const Duration(milliseconds: 300));
    expect(reads.length, 2);
    await tester.drag(
      find.byType(CustomScrollView).first,
      const Offset(0, -6000),
    );
    for (var i = 0; i < 40; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    // The queue for the first screen was replaced by the rows now visible.
    expect(reads.containsKey('thread-5'), isFalse);
    expect(reads.keys.any((id) => int.parse(id.split('-').last) >= 25), isTrue);
    expect(reads.length, lessThanOrEqualTo(10));
    expect(reads.values.every((count) => count == 1), isTrue);
    await drain(tester);
  });

  testWidgets('a prefetched conversation opens with its body at once', (
    tester,
  ) async {
    final reads = await _mount(tester);
    await settleMail(tester);
    expect(reads.containsKey('thread-3'), isTrue);
    await tester.tap(find.text('Synthetic subject 3'));
    await tester.pump();
    expect(readerText('Full body 3'), findsOneWidget);
    expect(reads['thread-3'], 1);
    await drain(tester);
  });

  testWidgets('the shell keeps inbox chrome and its Back closes the pane', (
    tester,
  ) async {
    setMailSurface(tester, _tablet);
    final repository = MailPreviewRepository();
    stubMailPreview(repository);
    final actions = ShellChromeActionsCubit();
    final titles = ShellTitleOverrideCubit();
    addTearDown(actions.close);
    addTearDown(titles.close);
    await tester.pumpThemedHome(
      MailWorkspace(workspaceId: 'ws', repository: repository),
      wrap: (app) => MultiBlocProvider(
        providers: [
          BlocProvider.value(value: actions),
          BlocProvider.value(value: titles),
        ],
        child: app,
      ),
    );
    await settleMail(tester);
    expect(actions.state.backForLocation(Routes.mail), isNull);
    await tester.tap(find.text('Synthetic subject 1'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
    // The pane header owns message actions; the shell keeps the inbox's.
    final ids = actions.state
        .resolveForLocation(Routes.mail)
        .map((action) => action.id);
    expect(ids, contains('mail-compose'));
    expect(ids, isNot(contains('mail-primary-action')));
    expect(titles.state.resolveForLocation(Routes.mail), 'Inbox');
    final back = actions.state.backForLocation(Routes.mail);
    expect(back, isNotNull);
    await back!();
    await tester.pump();
    expect(find.byType(MailReader), findsNothing);
    expect(actions.state.backForLocation(Routes.mail), isNull);
    await drain(tester);
  });

  testWidgets('split read failure does not overwrite a newer filtered list '
      'or concurrent row removal', (tester) async {
    setMailSurface(tester, _tablet);
    final repository = MailPreviewRepository();
    stubMailPreview(repository, threads: 2);
    when(
      () => repository.detail('ws', 'box', 'thread-0', thread: true),
    ).thenAnswer(
      (_) async => {
        'thread': {'id': 'thread-0', 'subject': 'Unread zero'},
        'messages': [
          {
            'id': 'message-0',
            'fromAddress': 'sender@example.invalid',
            'bodyText': 'Body zero',
            'unread': true,
          },
        ],
      },
    );
    when(
      () => repository.list(
        'ws',
        'box',
        folder: any(named: 'folder'),
        query: any(named: 'query'),
        page: any(named: 'page'),
        label: any(named: 'label'),
        folderId: any(named: 'folderId'),
        forceRefresh: any(named: 'forceRefresh'),
      ),
    ).thenAnswer((invocation) async {
      final query = invocation.namedArguments[#query] as String;
      if (query == 'is:starred') {
        return {
          'threads': [
            {
              'id': 'starred-only',
              'subject': 'Starred subject',
              'unread': false,
              'participants': <dynamic>[],
            },
          ],
          'pagination': {'hasMore': false},
        };
      }
      return {
        'threads': [
          {
            'id': 'thread-0',
            'subject': 'Unread zero',
            'unread': true,
            'unreadCount': 1,
            'participants': <dynamic>[],
          },
          {
            'id': 'thread-1',
            'subject': 'Second thread',
            'unread': false,
            'participants': <dynamic>[],
          },
        ],
        'pagination': {'hasMore': false},
      };
    });
    final markRead = Completer<void>();
    when(
      () => repository.changeState(
        'ws',
        'box',
        'thread-0',
        'mark_read',
        thread: true,
      ),
    ).thenAnswer((_) => markRead.future);

    await tester.pumpApp(
      MailWorkspace(workspaceId: 'ws', repository: repository),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Unread zero'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));

    // Switch to Starred while mark_read is still pending, then fail mark_read.
    await tester.tap(find.byKey(const ValueKey('mail-quick-filter-starred')));
    await tester.pumpAndSettle();
    expect(find.text('Starred subject'), findsOneWidget);

    markRead.completeError(
      const ApiException(message: 'Failed', statusCode: 500),
    );
    await tester.pumpAndSettle();
    expect(find.text('Starred subject'), findsOneWidget);
    expect(find.text('Second thread'), findsNothing);
    await drain(tester);
  });
}
