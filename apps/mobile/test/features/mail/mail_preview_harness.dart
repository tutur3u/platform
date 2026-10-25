import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mail/data/mail_repository.dart';
import 'package:mobile/features/mail/view/mail_reader.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';

class MailPreviewRepository extends Mock implements MailRepository {}

/// Synthetic inbox rows; nothing here resembles real mail.
List<Map<String, dynamic>> syntheticThreads(int count) => [
  for (var i = 0; i < count; i++)
    {
      'id': 'thread-$i',
      'subject': 'Synthetic subject $i',
      'fromName': 'Sender $i',
      'fromAddress': 'sender$i@example.invalid',
      'latestSnippet': 'Snippet $i',
      'participants': <dynamic>[],
      'unreadCount': 0,
    },
];

Map<String, dynamic> syntheticDetail(String id) {
  final index = id.split('-').last;
  return {
    'thread': {'id': id, 'subject': 'Synthetic subject $index'},
    'messages': [
      {
        'id': 'message-$index',
        'fromName': 'Sender $index',
        'fromAddress': 'sender$index@example.invalid',
        'bodyText': 'Full body $index',
        'direction': 'outbound',
        'attachments': <dynamic>[],
        'recipients': <dynamic>[],
      },
    ],
  };
}

/// Stubs a mailbox whose thread details arrive after [latency], counting
/// every detail read per thread id.
Map<String, int> stubMailPreview(
  MailPreviewRepository repository, {
  int threads = 12,
  Duration latency = const Duration(milliseconds: 450),
  Set<String> cachedIds = const {},
  String mailboxId = 'box',
}) {
  SharedPreferences.setMockInitialValues({});
  final reads = <String, int>{};
  when(() => repository.cachedThread(any(), any(), any())).thenAnswer((
    invocation,
  ) async {
    final id = invocation.positionalArguments[2] as String;
    return cachedIds.contains(id) ? syntheticDetail(id) : null;
  });
  when(() => repository.savedView(any())).thenAnswer((_) async => null);
  when(() => repository.saveView(any(), any())).thenAnswer((_) async {});
  when(() => repository.accessRevoked).thenReturn(null);
  when(() => repository.bootstrap('ws')).thenAnswer(
    (_) async => {
      'mailboxes': [
        {
          'id': mailboxId,
          'address': 'synthetic@example.invalid',
          'status': 'active',
          'role': 'owner',
        },
      ],
    },
  );
  when(
    () => repository.organization('ws', mailboxId),
  ).thenAnswer((_) async => {});
  when(
    () => repository.list(
      'ws',
      mailboxId,
      folder: any(named: 'folder'),
      query: any(named: 'query'),
      page: any(named: 'page'),
      label: any(named: 'label'),
      folderId: any(named: 'folderId'),
      forceRefresh: any(named: 'forceRefresh'),
    ),
  ).thenAnswer(
    (_) async => {
      'threads': syntheticThreads(threads),
      'pagination': {'hasMore': false},
    },
  );
  when(
    () => repository.detail('ws', mailboxId, any(), thread: true),
  ).thenAnswer((invocation) async {
    final id = invocation.positionalArguments[2] as String;
    reads[id] = (reads[id] ?? 0) + 1;
    await Future<void>.delayed(latency);
    return syntheticDetail(id);
  });
  when(() => repository.refreshThread('ws', mailboxId, any())).thenAnswer((
    invocation,
  ) async {
    await Future<void>.delayed(latency);
    return syntheticDetail(invocation.positionalArguments[2] as String);
  });
  when(
    () => repository.changeState(
      'ws',
      mailboxId,
      any(),
      any(),
      thread: any(named: 'thread'),
      snoozedUntil: any(named: 'snoozedUntil'),
    ),
  ).thenAnswer((_) async {});
  return reads;
}

Finder readerText(String text) =>
    find.descendant(of: find.byType(MailReader), matching: find.text(text));

/// Pumps 8ms frames until [finder] is hittable on screen, returning the
/// elapsed fake time. A reader still sliding in is not yet readable.
Future<Duration> pumpUntilReadable(
  WidgetTester tester,
  Finder finder, {
  Duration limit = const Duration(seconds: 5),
}) async {
  const step = Duration(milliseconds: 8);
  var elapsed = Duration.zero;
  bool readable() {
    if (finder.evaluate().isEmpty) return false;
    final route = ModalRoute.of(finder.evaluate().first);
    final settled =
        route == null ||
        route.animation == null ||
        route.animation!.status == AnimationStatus.completed;
    return settled && finder.hitTestable().evaluate().isNotEmpty;
  }

  while (!readable()) {
    if (elapsed >= limit) return limit;
    await tester.pump(step);
    elapsed += step;
  }
  return elapsed;
}

void setMailSurface(WidgetTester tester, Size size) {
  tester.view
    ..physicalSize = size
    ..devicePixelRatio = 1;
  addTearDown(tester.view.reset);
}

/// Waits for the inbox list (and any background warm-up) to settle without
/// relying on pumpAndSettle, which the periodic snooze refresh would defeat.
Future<void> settleMail(WidgetTester tester) async {
  for (var i = 0; i < 20; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

Future<void> drain(WidgetTester tester) async {
  await tester.pumpWidget(const SizedBox.shrink());
  await tester.pump(const Duration(seconds: 2));
  unawaited(Future<void>.value());
}
