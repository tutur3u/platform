@Tags(['golden'])
library;

import 'dart:io';

import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/theme/sorbet/sorbet_preferences.dart';
import 'package:mobile/data/models/stored_auth_account.dart';
import 'package:mobile/data/models/time_tracking/stats.dart';
import 'package:mobile/data/models/user_profile.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/profile/view/profile_focus_time_card.dart';
import 'package:mobile/features/profile/view/profile_identity_header.dart';
import 'package:mobile/features/profile/view/profile_overview_page.dart';
import 'package:mobile/features/profile/view/profile_sections.dart';
import 'package:mocktail/mocktail.dart';
import 'package:supabase_flutter/supabase_flutter.dart' show User;

import '../../helpers/design_render_harness.dart';
import '../../helpers/golden_tolerance.dart';
import '../../helpers/pump_app.dart';

class _Auth extends MockCubit<AuthState> implements AuthCubit {}

const _identity = UserProfile(
  id: 'demo-active',
  email: 'linh@example.test',
  displayName: 'Linh Tran',
  bio: 'Designs calm tools for busy teams.',
);

void _noop() {}

void main() {
  final originalComparator = goldenFileComparator;
  late _Auth auth;

  setUpAll(() async {
    await DesignRender.loadFonts(forGoldens: true);
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
          const MethodChannel('mobile/shell_back'),
          (_) async => null,
        );
    goldenFileComparator = GoldenTolerance(
      File(
        'test/features/profile/account_switcher_goldens_test.dart',
      ).absolute.uri,
    );
  });
  tearDownAll(() {
    goldenFileComparator = originalComparator;
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
          const MethodChannel('mobile/shell_back'),
          null,
        );
  });

  setUp(() {
    auth = _Auth();
    when(() => auth.isClosed).thenReturn(false);
    when(auth.syncCurrentSessionToStore).thenAnswer((_) async {});
    whenListen(
      auth,
      const Stream<AuthState>.empty(),
      initialState:
          const AuthState.authenticated(
            User(
              id: 'demo-active',
              email: 'linh@example.test',
              appMetadata: {},
              userMetadata: {},
              aud: 'authenticated',
              createdAt: '',
            ),
          ).copyWith(
            activeAccountId: 'studio',
            expiredAccountIds: const {'studio'},
            accounts: const [
              StoredAuthAccount(
                id: 'work',
                refreshToken: '',
                lastActiveAt: 2,
                addedAt: 1,
                displayName: 'Linh at Studio',
                email: 'linh@studio.example.test',
              ),
              StoredAuthAccount(
                id: 'studio',
                refreshToken: '',
                lastActiveAt: 1,
                addedAt: 1,
                displayName: 'Alex Doe',
                email: 'alex@example.test',
              ),
            ],
          ),
    );
  });
  tearDown(() => auth.close());

  for (final (design, sorbet) in [
    ('classic', null),
    ('sorbet', const SorbetTheme()),
  ]) {
    for (final brightness in Brightness.values) {
      final name = 'account_switcher_${design}_${brightness.name}_phone';
      testWidgets(name, (tester) async {
        tester.view
          ..physicalSize = const Size(390, 844)
          ..devicePixelRatio = 1
          ..padding = const FakeViewPadding(top: 48, bottom: 34)
          ..viewPadding = const FakeViewPadding(top: 48, bottom: 34);
        addTearDown(tester.view.reset);
        await tester.pumpWidget(
          BlocProvider<AuthCubit>.value(
            value: auth,
            child: sorbetTestApp(
              sorbet: sorbet,
              brightness: brightness,
              boundaryKey: const ValueKey('golden'),
              home: const Scaffold(
                body: SafeArea(
                  child: ProfileOverviewList(
                    profile: _identity,
                    header: ProfileIdentityHeader(
                      profile: _identity,
                      loading: false,
                    ),
                    focusTime: ProfileFocusTimeCard(
                      stats: TimeTrackerStats(
                        todayTime: 2700,
                        weekTime: 22800,
                        monthTime: 86400,
                      ),
                      onSeeAll: _noop,
                    ),
                  ),
                ),
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();
        await tester.tap(find.byType(ProfileAccountSwitchRow));
        await tester.pumpAndSettle();
        expect(
          find.byKey(const ValueKey('active-account-check')),
          findsOneWidget,
        );
        expect(find.text('Sign in again'), findsOneWidget);
        expect(tester.takeException(), isNull);
        await expectLater(
          find.byKey(const ValueKey('golden')),
          matchesGoldenFile('goldens/$name.png'),
        );
      });
    }
  }
}
