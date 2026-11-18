@Tags(['golden'])
library;

import 'dart:io';

import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/theme/sorbet/sorbet_preferences.dart';
import 'package:mobile/data/models/stored_auth_account.dart';
import 'package:mobile/data/models/time_tracking/stats.dart';
import 'package:mobile/data/models/user_profile.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/profile/profile_timeline_repository.dart';
import 'package:mobile/features/profile/view/profile_focus_time_card.dart';
import 'package:mobile/features/profile/view/profile_identity_header.dart';
import 'package:mobile/features/profile/view/profile_overview_page.dart';
import 'package:mobile/features/profile/view/profile_timeline_view.dart';

import '../../helpers/golden_tolerance.dart';
import '../../helpers/pump_app.dart';

class _Auth extends MockCubit<AuthState> implements AuthCubit {}

enum _Scene { profile, timeline }

void _noop() {}

final _now = DateTime(2026, 11, 18, 18);

ProfileTimelineItem _item(String title, String type, DateTime at) =>
    ProfileTimelineItem(
      id: title,
      type: type,
      createdAt: at,
      scope: 'personal',
      title: title,
    );

final List<ProfileTimelineItem> _items = [
  _item('Ship the onboarding brief', 'task', DateTime(2026, 11, 18, 16, 20)),
  _item(
    'Lunch with the design team',
    'transaction',
    DateTime(2026, 11, 18, 12),
  ),
  _item('Weekly planning', 'calendar', DateTime(2026, 11, 18, 9, 30)),
  _item('Client call', 'calendar', DateTime(2026, 11, 17, 15)),
  _item('Draft release notes', 'task', DateTime(2026, 11, 17, 10, 45)),
  _item('Ideas for the retreat', 'note', DateTime(2026, 11, 14, 8)),
];

Widget _scene(_Scene scene) => switch (scene) {
  _Scene.profile => const ProfileOverviewList(
    header: ProfileIdentityHeader(
      profile: UserProfile(
        id: 'user',
        email: 'linh@example.test',
        displayName: 'Linh Tran',
        bio: 'Designs calm tools for busy teams.',
      ),
      loading: false,
    ),
    focusTime: ProfileFocusTimeCard(
      stats: TimeTrackerStats(
        todayTime: 45 * 60,
        weekTime: 6 * 3600 + 20 * 60,
        monthTime: 24 * 3600,
      ),
      onSeeAll: _noop,
    ),
  ),
  _Scene.timeline => LayoutBuilder(
    builder: (context, constraints) => ProfileTimelineView(
      items: _items,
      now: _now,
      onOpen: (_) {},
      onFilterChanged: (_) {},
      contentTopPadding: AppLayout.pageTop,
      horizontalPadding: AppPageInsets.resolve(
        width: constraints.maxWidth,
        kind: AppPageKind.root,
        safeArea: MediaQuery.paddingOf(context),
      ),
    ),
  ),
};

/// Profile and Timeline at phone and tablet sizes, light and dark, classic
/// and Sorbet.
void main() {
  final original = goldenFileComparator;
  late _Auth auth;

  setUpAll(() {
    goldenFileComparator = GoldenTolerance(
      File('test/features/profile/profile_goldens_test.dart').absolute.uri,
    );
  });
  tearDownAll(() => goldenFileComparator = original);

  setUp(() {
    auth = _Auth();
    whenListen(
      auth,
      const Stream<AuthState>.empty(),
      initialState: const AuthState.unauthenticated().copyWith(
        activeAccountId: 'user',
        accounts: const [
          StoredAuthAccount(
            id: 'user',
            refreshToken: '',
            lastActiveAt: 3,
            addedAt: 1,
            displayName: 'Linh Tran',
          ),
          StoredAuthAccount(
            id: 'work',
            refreshToken: '',
            lastActiveAt: 2,
            addedAt: 1,
            displayName: 'Linh at Studio',
            email: 'linh@studio.example.test',
          ),
        ],
      ),
    );
  });
  tearDown(() => auth.close());

  for (final scene in _Scene.values) {
    for (final (design, sorbet) in [
      ('classic', null),
      ('sorbet', const SorbetTheme()),
    ]) {
      for (final brightness in Brightness.values) {
        for (final (device, size, top, bottom) in [
          ('phone', const Size(390, 844), 48.0, 34.0),
          ('tablet', const Size(834, 1194), 24.0, 20.0),
        ]) {
          final name = '${scene.name}_${design}_${brightness.name}_$device';
          testWidgets(name, (tester) async {
            tester.view
              ..physicalSize = size
              ..devicePixelRatio = 1
              ..padding = FakeViewPadding(top: top, bottom: bottom)
              ..viewPadding = FakeViewPadding(top: top, bottom: bottom);
            addTearDown(tester.view.reset);
            await tester.pumpWidget(
              BlocProvider<AuthCubit>.value(
                value: auth,
                child: sorbetTestApp(
                  sorbet: sorbet,
                  brightness: brightness,
                  boundaryKey: const ValueKey('golden'),
                  home: Scaffold(body: SafeArea(child: _scene(scene))),
                ),
              ),
            );
            await tester.pumpAndSettle();
            await expectLater(
              find.byKey(const ValueKey('golden')),
              matchesGoldenFile('goldens/$name.png'),
            );
            expect(tester.takeException(), isNull);
          });
        }
      }
    }
  }
}
