import 'dart:ui' show Size;

import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/mastermind/threads/history/mastermind_thread_history_page.dart';
import 'package:mobile/features/mastermind/threads/mastermind_threads_page.dart';
import 'package:mobile/features/mastermind/threads/threads_flag.dart';
import 'package:mobile/features/mastermind/view/work/mastermind_work_page.dart';
import 'package:mobile/features/security/cubit/app_lock_cubit.dart';
import 'package:mobile/features/security/data/app_lock_settings_store.dart';
import 'package:mobile/features/security/data/local_auth_service.dart';
import 'package:mocktail/mocktail.dart';

import '../../../../helpers/helpers.dart';
import '../../../../helpers/mastermind_thread_history_fixture.dart';
import '../../../../helpers/mastermind_view_harness.dart';
import '../../../../helpers/mastermind_work_pump.dart';

class _Auth extends Mock implements LocalAuthService {}

class _Store extends Mock implements AppLockSettingsStore {}

Future<Uri> _open(WidgetTester tester, String location) async {
  workSurface(tester, const Size(390, 844));
  final store = _Store();
  when(store.isEnabled).thenAnswer((_) async => false);
  when(store.readDelay).thenAnswer((_) async => AppLockDelay.immediately);
  final lock = AppLockCubit(localAuthService: _Auth(), settingsStore: store);
  await lock.load();
  addTearDown(lock.close);
  final harness = MastermindViewHarness();
  addTearDown(harness.dispose);
  await harness.setAccess(TestAccess.enabled);
  final router = workRouter(location);
  await tester.pumpAppRouter(
    router,
    wrap: (app) =>
        harness.wrap(BlocProvider<AppLockCubit>.value(value: lock, child: app)),
  );
  await tester.pumpAndSettle();
  return workUri(router);
}

void main() {
  setUpAll(initializeDateFormatting);
  tearDown(() {
    debugOverrideMastermindThreads(enabled: null);
    debugOverrideMastermindThreadHistory(enabled: null);
  });

  final location = threadHistoryLocation(threadRef(1));

  test('history defaults to off in a default build', () {
    expect(mastermindThreadHistoryEnabled, isFalse);
    debugOverrideMastermindThreads(enabled: true);
    expect(mastermindThreadHistoryEnabled, isFalse);
  });

  test('history needs Threads on as well', () {
    debugOverrideMastermindThreadHistory(enabled: true);
    debugOverrideMastermindThreads(enabled: false);
    expect(mastermindThreadHistoryEnabled, isFalse);
    debugOverrideMastermindThreads(enabled: true);
    expect(mastermindThreadHistoryEnabled, isTrue);
  });

  testWidgets('both flags off: a history link opens Work', (tester) async {
    debugOverrideMastermindThreadHistory(enabled: true);
    debugOverrideMastermindThreads(enabled: false);
    final uri = await _open(tester, location);
    expect(uri.path, Routes.mastermindWork);
    expect(find.byType(MastermindWorkPage), findsOneWidget);
    expect(find.byType(MastermindThreadHistoryPage), findsNothing);
  });

  testWidgets('history off: a history link opens the Threads list', (
    tester,
  ) async {
    debugOverrideMastermindThreads(enabled: true);
    debugOverrideMastermindThreadHistory(enabled: false);
    final uri = await _open(tester, location);
    expect(uri.path, '/mastermind/threads');
    expect(find.byType(MastermindThreadsPage), findsOneWidget);
    expect(find.byType(MastermindThreadHistoryPage), findsNothing);
  });

  testWidgets('both on: the history page opens, with no hub configured', (
    tester,
  ) async {
    debugOverrideMastermindThreads(enabled: true);
    debugOverrideMastermindThreadHistory(enabled: true);
    final uri = await _open(tester, location);
    expect(uri.path, location);
    expect(find.byType(MastermindThreadHistoryPage), findsOneWidget);
    // A test build has no hub URL, so nothing is read.
    expect(find.text('Not available on mobile'), findsOneWidget);
  });
}
