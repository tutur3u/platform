part of 'appearance_root_tabs_render_test.dart';

const _profileUserId = 'synthetic-user';
const _personalWorkspace = Workspace(id: 'synthetic-personal', personal: true);

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
    profilePageBuilder: (token) => ProfileOverviewPage(replayToken: token),
  );
  await tester.runAsync(
    () => Future<void>.delayed(const Duration(milliseconds: 50)),
  );
  await settleShell(tester);
}

/// Profile with fixture data at phone, tablet and desktop sizes in every
/// review appearance. Timeline renders in its own goldens.
void _profileRenderCases() {
  for (final size in renderSizes.entries) {
    for (final look in renderAppearances.entries) {
      testWidgets('Profile renders on ${size.key} in ${look.key}', (
        tester,
      ) async {
        await _pumpProfile(tester, size: size.value, look: look.value);

        expect(find.text('Linh Tran'), findsOneWidget);
        final identity = find.byType(ProfileIdentityHeader);
        if (size.key == 'phone') {
          expect(
            tester.getTopLeft(identity).dx,
            AppLayout.gutter(DeviceClass.compact),
          );
        } else {
          expect(tester.getSize(identity).width, lessThanOrEqualTo(720));
        }
        expect(
          tester.getSize(find.byKey(profileEditIdentityKey)).height,
          greaterThanOrEqualTo(44),
        );
        // Search belongs to screens that search their own content.
        expect(find.byIcon(AppIcons.search), findsNothing);
        await _capture(tester, 'profile-overview-${size.key}-${look.key}');
        expect(tester.takeException(), isNull);
      });
    }
  }
}
