import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/security/account/account_security_page.dart';
import 'package:mobile/features/security/account/account_security_repository.dart';
import 'package:mobile/features/security/data/local_auth_service.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart' as supa;

import '../../../helpers/helpers.dart';

class _Repo extends Mock implements AccountSecurityRepository {}

class _Auth extends Mock implements LocalAuthService {}

const _chromeMac =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
    '(KHTML, like Gecko) Chrome/158.0.0.0 Safari/537.36';
const _t3Code =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
    '(KHTML, like Gecko) T3CodeNightly/0.1.12 Chrome/142.0.0.0 '
    'Electron/39.2.1 Safari/537.36';
const _safariPhone =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) '
    'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 '
    'Safari/604.1';

supa.UserIdentity _identity(String provider) => supa.UserIdentity(
  id: 'identity-$provider',
  userId: 'user',
  identityData: {'email': 'person@example.test'},
  identityId: 'identity-$provider',
  provider: provider,
  createdAt: '2026-01-01T00:00:00Z',
  lastSignInAt: '2026-11-01T00:00:00Z',
);

List<AccountSession> _sessions() {
  final now = DateTime.now();
  return [
    AccountSession(
      id: 's-old-app',
      label: 'Dart/3.14 (dart:io)',
      current: false,
      lastActive: now.subtract(const Duration(days: 12)),
      ip: '27.72.1.2/32',
    ),
    AccountSession(
      id: 's-chrome',
      label: _chromeMac,
      current: false,
      lastActive: now.subtract(const Duration(hours: 2)),
      createdAt: now.subtract(const Duration(days: 4)),
      ip: '14.161.22.9/32',
    ),
    AccountSession(
      id: 's-this',
      label: 'Dart/3.14 (dart:io)',
      current: true,
      lastActive: now,
      ip: '113.161.40.7/32',
    ),
    AccountSession(
      id: 's-t3',
      label: _t3Code,
      current: false,
      lastActive: now.subtract(const Duration(hours: 5)),
      ip: '2402:800:63b5:91c2::1f/128',
    ),
    AccountSession(
      id: 's-safari',
      label: _safariPhone,
      current: false,
      lastActive: now.subtract(const Duration(hours: 30)),
      ip: '171.250.3.4/32',
    ),
  ];
}

void main() {
  late _Repo repo;
  late _Auth auth;

  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    SharedPreferences.setMockInitialValues({});
    await supa.Supabase.initialize(
      url: 'https://synthetic.supabase.test',
      publishableKey: 'synthetic-test-key',
      authOptions: const supa.FlutterAuthClientOptions(
        autoRefreshToken: false,
        detectSessionInUri: false,
        localStorage: supa.EmptyLocalStorage(),
      ),
    );
  });
  tearDownAll(() => supa.Supabase.instance.dispose());

  setUp(() {
    repo = _Repo();
    auth = _Auth();
    when(repo.sessions).thenAnswer((_) async => _sessions());
    when(repo.identities).thenAnswer((_) async => const []);
    when(repo.revokeOthers).thenAnswer((_) async {});
    when(() => repo.revoke(any())).thenAnswer((_) async {});
    when(
      () => auth.authenticate(reason: any(named: 'reason')),
    ).thenAnswer((_) async => true);
  });

  Future<void> open(
    WidgetTester tester, {
    Size size = const Size(390, 1400),
  }) async {
    tester.view.physicalSize = size;
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpApp(
      Scaffold(
        body: AccountSecurityPage(repository: repo, localAuth: auth),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets('unnamed desktop apps never show their product token', (
    tester,
  ) async {
    final now = DateTime.now();
    when(repo.sessions).thenAnswer(
      (_) async => [
        AccountSession(
          id: 's-this',
          label: 'Dart/3.14 (dart:io)',
          current: true,
          lastActive: now,
        ),
        AccountSession(
          id: 's-electron',
          label:
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
              '(KHTML, like Gecko) Workstation-QA-0142/4.41.0 Chrome/130.0 '
              'Electron/33.0 Safari/537.36',
          current: false,
          lastActive: now.subtract(const Duration(hours: 1)),
        ),
      ],
    );
    await open(tester);

    expect(find.text('Desktop app on Windows'), findsOneWidget);
    expect(find.textContaining('Workstation'), findsNothing);
  });

  testWidgets('groups sessions under friendly labels without raw addresses', (
    tester,
  ) async {
    await open(tester);

    expect(find.text('This device'), findsOneWidget);
    expect(find.text('Active recently'), findsOneWidget);
    expect(find.text('Older'), findsOneWidget);
    expect(find.text('Chrome on macOS'), findsOneWidget);
    expect(find.text('T3 Code on macOS'), findsOneWidget);
    expect(find.text('Safari on iPhone'), findsOneWidget);
    expect(find.text('Tuturuuu app'), findsOneWidget);
    expect(find.text('Tuturuuu app on Android'), findsOneWidget);
    expect(find.textContaining('14.161.x.x'), findsOneWidget);
    expect(find.textContaining('2402:800:…'), findsOneWidget);
    expect(find.textContaining('/32'), findsNothing);
    expect(find.textContaining('/128'), findsNothing);
    expect(find.textContaining('Mozilla'), findsNothing);
    expect(find.textContaining('2 hours ago'), findsOneWidget);
    expect(find.textContaining('Yesterday'), findsOneWidget);
    expect(find.text('Sign out all other sessions'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('details show the raw user agent and the full address', (
    tester,
  ) async {
    await open(tester);
    await tester.tap(find.text('Chrome on macOS'));
    await tester.pumpAndSettle();

    expect(find.text(_chromeMac), findsOneWidget);
    expect(find.text('14.161.22.9'), findsOneWidget);
    expect(find.text('Last active'), findsOneWidget);
    expect(find.text('Signed in'), findsOneWidget);
    expect(find.text('Sign out this session'), findsOneWidget);
  });

  testWidgets(
    'sign out all confirms in-app, verifies the device, then revokes',
    (tester) async {
      await open(tester);
      await tester.tap(find.text('Sign out all other sessions'));
      await tester.pumpAndSettle();

      expect(find.text('Sign out all other sessions?'), findsOneWidget);
      verifyNever(() => auth.authenticate(reason: any(named: 'reason')));
      await tester.tap(find.text('Sign out all others'));
      await tester.pumpAndSettle();

      verify(() => auth.authenticate(reason: any(named: 'reason'))).called(1);
      verify(repo.revokeOthers).called(1);
      verify(repo.sessions).called(2);
      expect(find.text('Other sessions signed out'), findsOneWidget);
      await tester.pump(const Duration(seconds: 5));
    },
  );

  testWidgets('cancelling or failing device verification never revokes', (
    tester,
  ) async {
    await open(tester);
    await tester.tap(find.text('Sign out all other sessions'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();
    verifyNever(() => auth.authenticate(reason: any(named: 'reason')));

    when(
      () => auth.authenticate(reason: any(named: 'reason')),
    ).thenAnswer((_) async => false);
    await tester.tap(find.text('Sign out all other sessions'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Sign out all others'));
    await tester.pumpAndSettle();

    verify(() => auth.authenticate(reason: any(named: 'reason'))).called(1);
    verifyNever(repo.revokeOthers);
    verifyNever(() => repo.revoke(any()));
  });

  testWidgets('a single session signs out after its own confirmation', (
    tester,
  ) async {
    await open(tester);
    await tester.tap(find.byTooltip('Sign out Chrome on macOS'));
    await tester.pumpAndSettle();

    expect(find.text('Sign out Chrome on macOS?'), findsOneWidget);
    await tester.tap(find.text('Sign out'));
    await tester.pumpAndSettle();

    verify(() => repo.revoke('s-chrome')).called(1);
    verifyNever(repo.revokeOthers);
    await tester.pump(const Duration(seconds: 5));
  });

  testWidgets('this device has no sign-out action', (tester) async {
    await open(tester);
    expect(find.byTooltip('Sign out Tuturuuu app on Android'), findsNothing);
  });

  testWidgets('a failed first load offers a retry', (tester) async {
    var calls = 0;
    when(repo.sessions).thenAnswer((_) async {
      if (++calls == 1) throw Exception('offline');
      return _sessions();
    });
    await open(tester);

    expect(find.text("Couldn't load sessions"), findsOneWidget);
    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();
    expect(find.text('Chrome on macOS'), findsOneWidget);
  });

  testWidgets('a failing sessions endpoint keeps the sign-in methods', (
    tester,
  ) async {
    when(repo.sessions).thenAnswer((_) async => throw Exception('500'));
    when(repo.identities).thenAnswer((_) async => [_identity('google')]);
    await open(tester);

    expect(find.text("Couldn't load sessions"), findsOneWidget);
    expect(find.text('Connected accounts'), findsOneWidget);
    expect(find.text('Google'), findsOneWidget);
    expect(find.text('Connect Apple'), findsOneWidget);
    expect(find.text('Connect GitHub'), findsOneWidget);
    expect(find.text('Connect Google'), findsNothing);
  });

  testWidgets('a failing connections endpoint keeps sessions and retries', (
    tester,
  ) async {
    var calls = 0;
    when(repo.identities).thenAnswer((_) async {
      if (++calls == 1) throw Exception('500');
      return [_identity('google')];
    });
    await open(tester);

    expect(find.text('Chrome on macOS'), findsOneWidget);
    expect(find.text("Couldn't load connected accounts"), findsOneWidget);
    // Without the list, no provider is offered as connectable.
    expect(find.textContaining('Connect G'), findsNothing);

    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();
    expect(find.text("Couldn't load connected accounts"), findsNothing);
    expect(find.text('Google'), findsOneWidget);
    expect(find.text('Connect Apple'), findsOneWidget);
  });

  testWidgets('a failed refresh keeps the lists and offers a retry', (
    tester,
  ) async {
    var calls = 0;
    when(repo.sessions).thenAnswer((_) async {
      if (++calls == 2) throw Exception('offline');
      return _sessions();
    });
    await open(tester);
    expect(
      find.text("Couldn't refresh sessions and connections."),
      findsNothing,
    );

    // The sign-out succeeds; the reload that follows it fails.
    await tester.tap(find.byTooltip('Sign out Chrome on macOS'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Sign out'));
    await tester.pumpAndSettle();

    verify(() => repo.revoke('s-chrome')).called(1);
    expect(find.text('Chrome on macOS'), findsOneWidget);
    expect(find.text("Couldn't load sessions"), findsNothing);
    expect(find.text("Couldn't finish that change. Try again."), findsNothing);
    expect(
      find.text("Couldn't refresh sessions and connections."),
      findsOneWidget,
    );

    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();
    verify(repo.sessions).called(3);
    expect(
      find.text("Couldn't refresh sessions and connections."),
      findsNothing,
    );
    await tester.pump(const Duration(seconds: 5));
  });

  testWidgets('refresh retry stays busy and coalesces overlapping loads', (
    tester,
  ) async {
    var calls = 0;
    final third = Completer<List<AccountSession>>();
    when(repo.sessions).thenAnswer((_) {
      calls++;
      if (calls == 2) return Future.error(Exception('offline'));
      if (calls == 3) return third.future;
      return Future.value(_sessions());
    });
    await open(tester);

    await tester.tap(find.byTooltip('Sign out Chrome on macOS'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Sign out'));
    await tester.pumpAndSettle();
    await tester.pump(const Duration(seconds: 5));

    await tester.tap(find.text('Retry'));
    await tester.pump();
    // An overlapping pull-to-refresh while the retry is in flight must
    // coalesce onto the active fetch instead of starting another load.
    final refreshFuture = tester
        .widget<RefreshIndicator>(find.byType(RefreshIndicator))
        .onRefresh();
    var refreshDone = false;
    unawaited(refreshFuture.whenComplete(() => refreshDone = true));
    await tester.pump();

    expect(calls, 3);
    expect(refreshDone, isFalse);
    expect(find.byType(CircularProgressIndicator), findsOneWidget);

    third.complete(
      _sessions().where((session) => session.id != 's-chrome').toList(),
    );
    await refreshFuture;
    await tester.pumpAndSettle();

    expect(refreshDone, isTrue);
    expect(calls, 3);
    expect(
      find.text("Couldn't refresh sessions and connections."),
      findsNothing,
    );
    expect(find.text('Chrome on macOS'), findsNothing);
  });

  testWidgets(
    'duplicate client labels disambiguate sign-out controls and confirmations',
    (tester) async {
      final now = DateTime.now();
      when(repo.sessions).thenAnswer(
        (_) async => [
          AccountSession(
            id: 's-this',
            label: 'Dart/3.14 (dart:io)',
            current: true,
            lastActive: now,
            ip: '113.161.40.7/32',
          ),
          AccountSession(
            id: 's-chrome-1',
            label: _chromeMac,
            current: false,
            lastActive: now.subtract(const Duration(hours: 2)),
            ip: '14.161.22.9/32',
          ),
          AccountSession(
            id: 's-chrome-2',
            label: _chromeMac,
            current: false,
            lastActive: now.subtract(const Duration(hours: 2)),
            ip: '14.161.22.10/32',
          ),
          AccountSession(
            id: 's-chrome-3',
            label: _chromeMac,
            current: false,
            lastActive: now.subtract(const Duration(hours: 5)),
            ip: '171.250.3.4/32',
          ),
        ],
      );
      await open(tester);

      const firstId = 'Chrome on macOS (14.161.x.x, 2 hours ago, #1)';
      const secondId = 'Chrome on macOS (14.161.x.x, 2 hours ago, #2)';
      const thirdId = 'Chrome on macOS (171.250.x.x, 5 hours ago)';
      expect(find.text('Chrome on macOS (#1)'), findsOneWidget);
      expect(find.text('Chrome on macOS (#2)'), findsOneWidget);
      expect(find.text('Chrome on macOS'), findsOneWidget);
      expect(find.byTooltip('Sign out $firstId'), findsOneWidget);
      expect(find.byTooltip('Sign out $secondId'), findsOneWidget);
      expect(find.byTooltip('Sign out $thirdId'), findsOneWidget);

      await tester.tap(find.byTooltip('Sign out $secondId'));
      await tester.pumpAndSettle();

      expect(find.text('Sign out $secondId?'), findsOneWidget);
      await tester.tap(find.text('Sign out'));
      await tester.pumpAndSettle();

      verify(() => repo.revoke('s-chrome-2')).called(1);
      await tester.pump(const Duration(seconds: 5));
    },
  );

  testWidgets('a failed sign-out shows the action failure message', (
    tester,
  ) async {
    when(() => repo.revoke(any())).thenThrow(Exception('500'));
    await open(tester);

    await tester.tap(find.byTooltip('Sign out Chrome on macOS'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Sign out'));
    await tester.pumpAndSettle();

    expect(
      find.text("Couldn't finish that change. Try again."),
      findsOneWidget,
    );
    expect(
      find.text("Couldn't refresh sessions and connections."),
      findsNothing,
    );
  });

  testWidgets('only this device shows the empty state', (tester) async {
    when(repo.sessions).thenAnswer(
      (_) async => [_sessions().firstWhere((session) => session.current)],
    );
    await open(tester);

    expect(find.text('No other sessions'), findsOneWidget);
    expect(find.text('Sign out all other sessions'), findsNothing);
  });

  for (final size in [const Size(768, 1024), const Size(1376, 1032)]) {
    testWidgets('lays out without overflow at $size', (tester) async {
      await open(tester, size: size);
      expect(find.text('Chrome on macOS'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  }
}
