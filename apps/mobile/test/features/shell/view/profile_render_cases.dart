part of 'appearance_root_tabs_render_test.dart';

const _profileUserId = 'synthetic-user';
const _personalWorkspace = Workspace(id: 'synthetic-personal', personal: true);

class _TimelineRepository extends ProfileTimelineRepository {
  @override
  Future<ProfileTimelineSnapshot?> cached(
    String workspaceId,
    String userId,
  ) async => null;

  @override
  Future<ProfileTimelineSnapshot> refresh(
    String workspaceId,
    String userId,
  ) async {
    final now = DateTime.now();
    DateTime at(int daysAgo, int hour) =>
        DateTime(now.year, now.month, now.day - daysAgo, hour, 15);
    ProfileTimelineItem item(
      String id,
      String type,
      DateTime createdAt,
      String title,
    ) => ProfileTimelineItem(
      id: id,
      type: type,
      createdAt: createdAt,
      scope: 'personal',
      title: title,
    );
    return (
      items: [
        item('t1', 'task', at(0, 9), 'Draft the onboarding checklist'),
        item('n1', 'note', at(0, 8), 'Ideas for the design review'),
        item('c1', 'calendar', at(1, 15), 'Team retrospective'),
        item('x1', 'transaction', at(1, 11), 'Studio software subscription'),
        item('t2', 'task', at(1, 10), 'Prepare sprint demo'),
        item('t3', 'task', at(4, 14), 'Review pull request feedback'),
      ],
      partial: false,
      limited: false,
    );
  }
}

Future<TimeTrackerStats> _profileStats(
  String workspaceId,
  String userId,
  String timezone, {
  required bool personal,
}) async {
  final now = DateTime.now();
  return TimeTrackerStats(
    todayTime: 5400,
    weekTime: 6 * 3600 + 1200,
    monthTime: 31 * 3600,
    dailyActivity: [
      for (var day = 0; day < 84; day++)
        if ((day * 7) % 5 != 0)
          DailyActivity(
            date: DateTime(now.year, now.month, now.day - day),
            duration: ((day * 37) % 9) * 1800,
          ),
    ],
  );
}

Future<void> _pumpProfile(
  WidgetTester tester, {
  required Size size,
  required (AppearanceSettings, shad.ThemeMode) look,
}) async {
  await pumpShellRender(
    tester,
    location: Routes.profileRoot,
    size: size,
    appearance: look.$1,
    themeMode: look.$2,
    extraLocations: const [Routes.settingsProfile],
    hasAuthenticatedActor: true,
    authState: const AuthState.authenticated(
      supa.User(
        id: _profileUserId,
        appMetadata: {},
        userMetadata: {},
        aud: 'authenticated',
        createdAt: '',
      ),
    ),
    workspaceState: const WorkspaceState(
      status: WorkspaceStatus.loaded,
      currentWorkspace: _personalWorkspace,
      workspaces: [_personalWorkspace],
    ),
    profileState: const ShellProfileState(
      userId: _profileUserId,
      profile: UserProfile(
        id: _profileUserId,
        displayName: 'Linh Tran',
        email: 'linh@example.test',
        bio:
            'Product designer. Planning, prototyping and the occasional '
            'late-night refactor.',
      ),
    ),
    profilePageBuilder: (token) => ProfileOverviewPage(
      replayToken: token,
      cacheUserId: () => _profileUserId,
      statsLoader: _profileStats,
      timezoneLoader: () async => 'Asia/Ho_Chi_Minh',
      timelineRepository: _TimelineRepository(),
    ),
  );
  await tester.runAsync(
    () => Future<void>.delayed(const Duration(milliseconds: 50)),
  );
  await settleShell(tester);
}

/// Profile Overview and Timeline with fixture data at phone, tablet and
/// desktop sizes in every review appearance.
void _profileRenderCases() {
  for (final size in renderSizes.entries) {
    for (final look in renderAppearances.entries) {
      testWidgets('Profile overview renders on ${size.key} in ${look.key}', (
        tester,
      ) async {
        await _pumpProfile(tester, size: size.value, look: look.value);

        expect(find.text('Linh Tran'), findsOneWidget);
        expect(find.byType(AppStatTile), findsNWidgets(3));
        expect(find.text('1h 30m'), findsOneWidget);
        final identity = find.byType(ProfileIdentityCard);
        if (size.key == 'phone') {
          expect(
            tester.getTopLeft(identity).dx,
            AppLayout.gutter(DeviceClass.compact),
          );
        } else if (size.key == 'desktop') {
          // Wide bodies put identity beside the Focus Time column, which
          // opens with its section header.
          expect(tester.getSize(identity).width, 360);
          expect(
            tester.getTopLeft(find.byKey(const ValueKey('you-focus-time'))).dy,
            tester.getTopLeft(identity).dy,
          );
          expect(find.byType(ProfileActivitySection), findsOneWidget);
        }
        expect(
          tester
              .getSize(find.byKey(const ValueKey('profile-edit-identity')))
              .height,
          greaterThanOrEqualTo(44),
        );
        // Search belongs to screens that search their own content.
        expect(find.byIcon(AppIcons.search), findsNothing);
        await _capture(tester, 'profile-overview-${size.key}-${look.key}');
        expect(tester.takeException(), isNull);
      });

      testWidgets('Profile timeline renders on ${size.key} in ${look.key}', (
        tester,
      ) async {
        await _pumpProfile(tester, size: size.value, look: look.value);
        await tester.tap(find.byTooltip('Timeline'));
        await tester.runAsync(
          () => Future<void>.delayed(const Duration(milliseconds: 50)),
        );
        await settleShell(tester);

        expect(find.byType(ProfileTimelineBrowser), findsOneWidget);
        expect(find.text('Today'), findsOneWidget);
        expect(find.text('Yesterday'), findsOneWidget);
        expect(find.text('Draft the onboarding checklist'), findsOneWidget);
        final firstRow = find.byType(AppGroupedRow).first;
        if (size.key == 'phone') {
          expect(
            tester.getTopLeft(firstRow).dx,
            AppLayout.gutter(DeviceClass.compact),
          );
        } else {
          expect(tester.getSize(firstRow).width, lessThanOrEqualTo(720));
        }
        await _capture(tester, 'profile-timeline-${size.key}-${look.key}');
        expect(tester.takeException(), isNull);
      });
    }
  }
}
