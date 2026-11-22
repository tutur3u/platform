import 'dart:async';

import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/theme/appearance/appearance_settings.dart';
import 'package:mobile/features/security/account/account_security_page.dart';
import 'package:mobile/features/security/account/account_security_repository.dart';
import 'package:mobile/features/security/cubit/app_lock_cubit.dart';
import 'package:mobile/features/security/data/app_lock_settings_store.dart';
import 'package:mobile/features/security/device_mfa/device_mfa_repository.dart';
import 'package:mobile/features/security/device_mfa/device_mfa_service.dart';
import 'package:mobile/features/security/device_mfa/device_mfa_sheet.dart';
import 'package:mobile/features/security/mfa_approval/data/mfa_approval_repository.dart';
import 'package:mobile/features/settings/view/settings_session_section.dart';
import 'package:mobile/features/settings/view/settings_tile.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart' as supa;

import '../../../helpers/design_render_harness.dart';

class _AppLock extends MockCubit<AppLockState> implements AppLockCubit {}

class _Approvals extends Mock implements MfaApprovalRepository {}

class _Sessions extends Mock implements AccountSecurityRepository {}

class _DeviceMfa extends Mock implements DeviceMfaService {}

/// Phone and desktop renders of the security screens. Without
/// `DESIGN_RENDER_DIR` this is a layout smoke test at both sizes.
void main() {
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
    await DesignRender.loadFonts();
  });
  tearDownAll(() => supa.Supabase.instance.dispose());

  Widget frame(String title, Widget body) => Column(
    children: [
      SizedBox(
        height: 56,
        child: Center(
          child: Text(
            title,
            style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700),
          ),
        ),
      ),
      Expanded(child: body),
    ],
  );

  Future<void> pump(WidgetTester tester, Size size, Widget child) async {
    DesignRender.setSize(tester, size);
    await tester.pumpWidget(
      DesignRenderApp(
        settings: const AppearanceSettings(),
        brightness: Brightness.light,
        child: child,
      ),
    );
    await tester.pumpAndSettle();
  }

  final sizes = {
    'phone': DesignRender.sizes['phone']!,
    'desktop': DesignRender.sizes['desktop']!,
  };

  testWidgets('idle approval explanation wraps in a narrow, large-text hub', (
    tester,
  ) async {
    final appLock = _AppLock();
    whenListen(
      appLock,
      const Stream<AppLockState>.empty(),
      initialState: const AppLockState(hasLoaded: true),
    );
    final approvals = _Approvals();
    when(approvals.listPending).thenAnswer(
      (_) async => (
        approvals: const <PendingMfaApproval>[],
        requiresMobileMfa: false,
        error: null,
      ),
    );
    await pump(
      tester,
      const Size(320, 1600),
      MediaQuery.withClampedTextScaling(
        minScaleFactor: 2,
        maxScaleFactor: 2,
        child: BlocProvider<AppLockCubit>.value(
          value: appLock,
          child: frame(
            'Session',
            AppPageListView(
              kind: AppPageKind.root,
              children: [
                SessionSettingsSection(
                  onSignOut: () {},
                  mfaApprovalRepository: approvals,
                ),
              ],
            ),
          ),
        ),
      ),
    );

    // The row has no action, so a tap-only details link would hide this
    // explanation from keyboard users.
    final explanation = find.text(
      'Open this screen when the web MFA page shows a pair code. '
      'Pending requests refresh automatically.',
    );
    expect(explanation, findsOneWidget);
    expect(tester.widget<Text>(explanation).maxLines, isNull);
    expect(
      find.descendant(
        of: find.ancestor(of: explanation, matching: find.byType(SettingsTile)),
        matching: find.byKey(const ValueKey('settings-tile-details-link')),
      ),
      findsNothing,
    );
    expect(tester.takeException(), isNull);
  });

  for (final MapEntry(key: device, value: size) in sizes.entries) {
    testWidgets('session hub on $device', (tester) async {
      final appLock = _AppLock();
      whenListen(
        appLock,
        const Stream<AppLockState>.empty(),
        initialState: const AppLockState(
          enabled: true,
          hasLoaded: true,
          delay: AppLockDelay.after1Minute,
        ),
      );
      final approvals = _Approvals();
      when(approvals.listPending).thenAnswer(
        (_) async => (
          approvals: [
            PendingMfaApproval(
              id: 'challenge',
              createdAt: DateTime.now(),
              expiresAt: DateTime.now().add(const Duration(minutes: 5)),
            ),
          ],
          requiresMobileMfa: false,
          error: null,
        ),
      );
      await pump(
        tester,
        size,
        BlocProvider<AppLockCubit>.value(
          value: appLock,
          child: frame(
            'Session',
            AppPageListView(
              kind: AppPageKind.root,
              children: [
                SessionSettingsSection(
                  onSignOut: () {},
                  mfaApprovalRepository: approvals,
                ),
              ],
            ),
          ),
        ),
      );
      expect(find.text('Sign-in & devices'), findsOneWidget);
      expect(find.text('1 pending'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await DesignRender.capture(tester, 'security/$device-session-hub');
    });

    testWidgets('sessions and connections on $device', (tester) async {
      final repo = _Sessions();
      final now = DateTime.now();
      when(repo.sessions).thenAnswer(
        (_) async => [
          AccountSession(
            id: 'this',
            label: 'Dart/3.14 (dart:io)',
            current: true,
            lastActive: now,
            ip: '113.161.40.7/32',
          ),
          AccountSession(
            id: 'chrome',
            label:
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
                'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/158.0.0.0 '
                'Safari/537.36',
            current: false,
            lastActive: now.subtract(const Duration(hours: 2)),
            ip: '14.161.22.9/32',
          ),
          AccountSession(
            id: 't3',
            label:
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
                'AppleWebKit/537.36 (KHTML, like Gecko) T3CodeNightly/0.1.12 '
                'Chrome/142.0.0.0 Electron/39.2.1 Safari/537.36',
            current: false,
            lastActive: now.subtract(const Duration(hours: 5)),
            createdAt: now.subtract(const Duration(days: 4)),
            ip: '2402:800:63b5:91c2::1f/128',
          ),
          AccountSession(
            id: 'safari',
            label:
                'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) '
                'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 '
                'Mobile/15E148 Safari/604.1',
            current: false,
            lastActive: now.subtract(const Duration(hours: 30)),
            ip: '171.250.3.4/32',
          ),
          AccountSession(
            id: 'old-app',
            label: 'Dart/3.14 (dart:io)',
            current: false,
            lastActive: now.subtract(const Duration(days: 12)),
            ip: '27.72.1.2/32',
          ),
        ],
      );
      when(repo.identities).thenAnswer((_) async => const []);
      await pump(
        tester,
        size,
        frame(
          'Sessions and connections',
          AccountSecurityPage(repository: repo),
        ),
      );
      await tester.tap(find.text('T3 Code on macOS'));
      await tester.pumpAndSettle();
      expect(find.textContaining('/32'), findsNothing);
      expect(tester.takeException(), isNull);
      await DesignRender.capture(tester, 'security/$device-sessions');
    });

    testWidgets('device authenticator on $device', (tester) async {
      final service = _DeviceMfa();
      when(service.status).thenAnswer(
        (_) async => (
          registry: DeviceMfaRegistry(
            locked: false,
            devices: [
              TrustedAuthenticator(
                factorId: 'phone',
                name: 'Skora iPhone 13',
                verified: true,
                createdAt: DateTime.utc(2026, 9, 20, 12),
              ),
              TrustedAuthenticator(
                factorId: 'phone-17',
                name: 'iPhone 17',
                verified: true,
                createdAt: DateTime.utc(2026, 10, 2, 12),
              ),
              TrustedAuthenticator(
                factorId: 'tab',
                name: 'Tablet S8 Tab',
                verified: true,
                createdAt: DateTime.utc(2026, 10, 14, 12),
              ),
              TrustedAuthenticator(
                factorId: 'mac',
                name: 'Skora Macbook M3 Pro',
                verified: true,
                createdAt: DateTime.utc(2026, 11, 18, 12),
              ),
            ],
          ),
          currentFactorId: 'mac',
        ),
      );
      await pump(
        tester,
        size,
        Builder(
          builder: (context) => Center(
            child: TextButton(
              onPressed: () =>
                  unawaited(showDeviceMfaSheet(context, service: service)),
              child: const Text('Open'),
            ),
          ),
        ),
      );
      await tester.tap(find.text('Open'));
      await tester.pumpAndSettle();
      expect(find.text('This device is registered'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await DesignRender.capture(tester, 'security/$device-authenticator');
      await tester.tap(find.byTooltip('Close authenticator'));
      await tester.pumpAndSettle();
    });
  }
}
