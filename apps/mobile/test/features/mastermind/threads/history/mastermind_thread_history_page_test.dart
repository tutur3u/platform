import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:intl/date_symbol_data_local.dart';
import 'package:mobile/core/ui/components/app_button.dart';
import 'package:mobile/features/mastermind/threads/history/mastermind_thread_history_page.dart';
import 'package:mobile/features/mastermind/threads/history/thread_history_client.dart';
import 'package:mobile/features/security/cubit/app_lock_cubit.dart';
import 'package:mobile/features/security/data/app_lock_settings_store.dart';
import 'package:mobile/features/security/data/local_auth_service.dart';
import 'package:mobile/features/security/secure_screen/secure_screen_scope.dart';
import 'package:mocktail/mocktail.dart';

import '../../../../helpers/helpers.dart';
import '../../../../helpers/mastermind_thread_history_fixture.dart';
import '../../../../helpers/mastermind_view_harness.dart';

class _Auth extends Mock implements LocalAuthService {}

class _Store extends Mock implements AppLockSettingsStore {}

final class _Env {
  _Env(this.lock, this.auth, this.store);
  final AppLockCubit lock;
  final _Auth auth;
  final _Store store;
}

Future<_Env> _pump(
  WidgetTester tester,
  FakeThreadsHub hub, {
  Locale locale = const Locale('en'),
  bool locked = false,
  double textScale = 1,
  Size size = const Size(390, 844),
}) async {
  tester.view
    ..devicePixelRatio = 1
    ..physicalSize = size;
  addTearDown(tester.view.reset);
  final auth = _Auth();
  final store = _Store();
  when(store.isEnabled).thenAnswer((_) async => locked);
  when(store.readDelay).thenAnswer((_) async => AppLockDelay.immediately);
  final lock = AppLockCubit(localAuthService: auth, settingsStore: store);
  await lock.load(lockIfEnabled: true);
  addTearDown(lock.close);
  final harness = MastermindViewHarness();
  addTearDown(harness.dispose);
  await harness.setAccess(TestAccess.enabled);
  final page = MastermindThreadHistoryPage(
    threadRef: threadRef(1),
    sourceFactory: hub.source,
  );
  tester.platformDispatcher.localesTestValue = [locale];
  addTearDown(tester.platformDispatcher.clearLocalesTestValue);
  await tester.pumpThemedHome(
    MediaQuery.withClampedTextScaling(
      minScaleFactor: textScale,
      maxScaleFactor: textScale,
      child: page,
    ),
    wrap: (app) =>
        harness.wrap(BlocProvider<AppLockCubit>.value(value: lock, child: app)),
  );
  await tester.pumpAndSettle();
  return _Env(lock, auth, store);
}

FakeThreadsHub _hub({List<Map<String, dynamic>>? messages, String? before}) =>
    FakeThreadsHub(
      FakeThreadsHub.serving(
        pages: {
          null: pageJson(
            messages:
                messages ??
                [
                  messageJson(1, author: 'owner_mac', text: 'Ship it?'),
                  messageJson(
                    2,
                    text: 'Updated ‹path› and ‹link: github.com›.',
                    truncated: true,
                    activity: {
                      'commands': 4,
                      'edits': 2,
                      'searches': 0,
                      'subagents': 0,
                    },
                  ),
                  messageJson(3, withheld: true, text: 'never shown'),
                ],
            nextBefore: before,
          ),
          msgRef(1): pageJson(messages: [messageJson(0)]),
        },
      ),
    );

void main() {
  setUpAll(initializeDateFormatting);

  testWidgets('renders plain text with neutral placeholders', (tester) async {
    await _pump(tester, _hub());
    expect(find.text('You (Mac)'), findsOneWidget);
    expect(find.text('Ship it?'), findsOneWidget);
    expect(
      find.text('Updated ‹path› and ‹link: github.com›.', findRichText: true),
      findsOneWidget,
    );
    expect(find.text('Ran 4 commands · Edited 2 files'), findsOneWidget);
    expect(find.text('Open on Mac for the rest.'), findsOneWidget);
    expect(find.text('Message withheld. Open on Mac.'), findsOneWidget);
    expect(find.textContaining('never shown'), findsNothing);
    // GMT+7 wall time, localized: 07:02 UTC is 14:02.
    expect(find.text('Oct 28 14:02'), findsOneWidget);
    // Plain text only: nothing in a message is tappable.
    expect(find.byType(InkWell), findsNothing);
  });

  testWidgets('Vietnamese strings and placeholders', (tester) async {
    await _pump(tester, _hub(), locale: const Locale('vi'));
    expect(find.text('Bạn (Mac)'), findsOneWidget);
    expect(
      find.text(
        'Updated ‹đường dẫn› and ‹liên kết: github.com›.',
        findRichText: true,
      ),
      findsOneWidget,
    );
    expect(find.text('Đã chạy 4 lệnh · Đã sửa 2 tệp'), findsOneWidget);
    expect(find.text('Tin nhắn đã bị ẩn. Mở trên Mac.'), findsOneWidget);
  });

  testWidgets('404 reads Not available on mobile', (tester) async {
    await _pump(tester, FakeThreadsHub(FakeThreadsHub.serving()));
    expect(find.text('Not available on mobile'), findsOneWidget);
    expect(find.text('Retry'), findsNothing);
  });

  testWidgets('429 reads Limit reached with a local retry time', (
    tester,
  ) async {
    await _pump(
      tester,
      FakeThreadsHub(
        (_) => http.Response(
          '{"error":"rate_limited"}',
          429,
          headers: {'retry-after': '60'},
        ),
      ),
    );
    expect(find.text('Limit reached'), findsOneWidget);
    // A local wall-clock time, never a raw timestamp.
    expect(
      find.textContaining(RegExp(r'^Try again after \d{2}:\d{2}\.$')),
      findsOneWidget,
    );
  });

  testWidgets('Load earlier prepends older messages', (tester) async {
    final hub = _hub(before: msgRef(1));
    await _pump(tester, hub);
    await tester.ensureVisible(find.text('Load earlier'));
    await tester.tap(find.text('Load earlier'));
    await tester.pumpAndSettle();
    expect(find.text('Message 0'), findsOneWidget);
    expect(hub.requests.last.url.queryParameters['before'], msgRef(1));
    expect(find.text('Load earlier'), findsNothing);
  });

  testWidgets('the app lock hides and drops the history', (tester) async {
    final hub = _hub();
    final env = await _pump(tester, hub);
    expect(find.text('Ship it?'), findsOneWidget);
    when(env.store.isEnabled).thenAnswer((_) async => true);
    await env.lock.load(lockIfEnabled: true);
    await tester.pumpAndSettle();
    expect(find.text('Ship it?'), findsNothing);
    expect(find.text('Unlock the app to see this thread'), findsOneWidget);

    when(
      () => env.auth.authenticate(reason: any(named: 'reason')),
    ).thenAnswer((_) async => true);
    final reads = hub.requests.length;
    await env.lock.unlock(reason: 'Unlock');
    await tester.pumpAndSettle();
    expect(find.text('Ship it?'), findsOneWidget);
    // Unlocking reads again: nothing was kept while locked.
    expect(hub.requests.length, greaterThan(reads));
  });

  testWidgets('opening while locked makes no request', (tester) async {
    final hub = _hub();
    await _pump(tester, hub, locked: true);
    expect(find.text('Unlock the app to see this thread'), findsOneWidget);
    expect(hub.requests, isEmpty);
  });

  testWidgets('secure screen while open, cover while in the background', (
    tester,
  ) async {
    final calls = <MethodCall>[];
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
      SecureScreen.channel,
      (call) async {
        calls.add(call);
        return null;
      },
    );
    addTearDown(
      () => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
        SecureScreen.channel,
        null,
      ),
    );
    await _pump(tester, _hub());
    expect(calls.single.arguments, {'secure': true});

    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
    await tester.pump();
    expect(find.byKey(const ValueKey('secure-screen-cover')), findsOneWidget);
    expect(find.text('Ship it?'), findsNothing);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pump();
    expect(find.text('Ship it?'), findsOneWidget);

    await tester.pumpWidget(const SizedBox());
    expect(calls.last.arguments, {'secure': false});
    expect(SecureScreen.holders, 0);
  });

  testWidgets('targets are at least 44pt and 200% text fits', (tester) async {
    await _pump(
      tester,
      _hub(before: msgRef(1)),
      textScale: 2,
      size: const Size(320, 2400),
    );
    expect(tester.takeException(), isNull);
    final button = tester.getSize(
      find.ancestor(
        of: find.text('Load earlier'),
        matching: find.byType(AppButton),
      ),
    );
    expect(button.height, greaterThanOrEqualTo(44));
    expect(button.width, greaterThanOrEqualTo(44));
    await expectLater(tester, meetsGuideline(iOSTapTargetGuideline));
    await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
  });

  test('every read problem has copy', () {
    // Exhaustive switch in the page: a new problem fails to compile there.
    expect(ThreadsProblem.values, hasLength(6));
  });
}
