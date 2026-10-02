part of 'shell_back_navigation_test.dart';

void _registerProfileNavigationChecks(
  AppTabCubit Function() appTabCubit,
  AuthCubit Function() authCubit,
  WorkspaceCubit Function() workspaceCubit,
  ShellProfileCubit Function() shellProfileCubit,
) {
  testWidgets('profile dock avatar keeps a placeholder until it has a URL', (
    tester,
  ) async {
    final cubit = shellProfileCubit();
    const loading = ShellProfileState(
      profile: UserProfile(id: 'user-1'),
      isRefreshing: true,
    );
    whenListen(
      cubit,
      const Stream<ShellProfileState>.empty(),
      initialState: loading,
    );
    await tester.pumpApp(
      BlocProvider<ShellProfileCubit>.value(
        value: cubit,
        child: const ProfileNavigationAvatar(),
      ),
    );
    expect(
      find.byKey(const ValueKey('profile-avatar-placeholder')),
      findsOneWidget,
    );
    expect(find.byKey(const ValueKey('profile-avatar-loading')), findsNothing);
  });

  testWidgets(
    'profile dock reserves an image skeleton and uses the avatar cache',
    (tester) async {
      final cubit = shellProfileCubit();
      const loading = ShellProfileState(
        userId: 'user-1',
        profile: UserProfile(id: 'user-1'),
        avatarUrl: 'https://example.test/avatar.png?token=one',
        avatarIdentityKey: 'https://example.test/avatar.png',
      );
      whenListen(
        cubit,
        const Stream<ShellProfileState>.empty(),
        initialState: loading,
      );
      await tester.pumpApp(
        BlocProvider<ShellProfileCubit>.value(
          value: cubit,
          child: const ProfileNavigationAvatar(),
        ),
      );
      final image = tester.widget<Image>(find.byType(Image));
      expect(image.image, isNot(isA<NetworkImage>()));
      expect(
        find.byKey(const ValueKey('profile-avatar-loading')),
        findsOneWidget,
      );
    },
  );

  testWidgets(
    'root dock owns Profile and Notifications without duplicate headers',
    (tester) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = const Size(390, 844);
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });

      final router = _buildRouter(initialLocation: Routes.apps);
      addTearDown(router.dispose);

      await tester.pumpWidget(
        _buildTestApp(
          router: router,
          appTabCubit: appTabCubit(),
          authCubit: authCubit(),
          workspaceCubit: workspaceCubit(),
          shellProfileCubit: shellProfileCubit(),
        ),
      );
      await _pumpForTransitions(tester);

      final rootNav = tester.widget<MorphingNavigationBar>(
        find.byType(MorphingNavigationBar),
      );
      expect(rootNav.children.map((item) => item.key), const [
        ValueKey('home'),
        ValueKey('apps'),
        ValueKey('assistant'),
        ValueKey('notifications'),
        ValueKey('profile'),
      ]);
      expect(find.byType(AvatarDropdown), findsNothing);
      expect(find.byType(NotificationsActionButton), findsNothing);

      router.go(Routes.tasks);
      await _pumpForTransitions(tester);
      expect(find.byType(AvatarDropdown), findsNothing);
      expect(find.byType(NotificationsActionButton), findsNothing);
    },
  );

  testWidgets('Settings returns to the Profile that opened it', (tester) async {
    final router = _buildRouter(initialLocation: Routes.profileRoot);
    addTearDown(router.dispose);
    await tester.pumpWidget(
      _buildTestApp(
        router: router,
        appTabCubit: appTabCubit(),
        authCubit: authCubit(),
        workspaceCubit: workspaceCubit(),
        shellProfileCubit: shellProfileCubit(),
      ),
    );
    await _pumpForTransitions(tester);
    router.go(Routes.settings);
    await _pumpForTransitions(tester);
    expect(appTabCubit().state.appOrigin, Routes.profileRoot);
    await tester.tap(find.bySemanticsLabel('Back'));
    await _pumpForTransitions(tester);
    expect(router.routeInformationProvider.value.uri.path, Routes.profileRoot);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'Workspace settings returns through Settings to its opening tab',
    (tester) async {
      final router = _buildRouter(initialLocation: Routes.profileRoot);
      addTearDown(router.dispose);
      await tester.pumpWidget(
        _buildTestApp(
          router: router,
          appTabCubit: appTabCubit(),
          authCubit: authCubit(),
          workspaceCubit: workspaceCubit(),
          shellProfileCubit: shellProfileCubit(),
        ),
      );
      await _pumpForTransitions(tester);
      router.go(Routes.settings);
      await _pumpForTransitions(tester);
      router.go(Routes.settingsWorkspace);
      await _pumpForTransitions(tester);
      await tester.binding.handlePopRoute();
      await _pumpForTransitions(tester);
      expect(router.routeInformationProvider.value.uri.path, Routes.settings);
      await tester.binding.handlePopRoute();
      await _pumpForTransitions(tester);
      expect(
        router.routeInformationProvider.value.uri.path,
        Routes.profileRoot,
      );
    },
  );
}
