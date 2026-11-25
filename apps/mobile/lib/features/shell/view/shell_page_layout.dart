part of 'shell_page.dart';

extension _ShellPageLayout on _ShellPageState {
  void _syncCompactLayoutState({String? oldMatchedLocation}) {
    final activeModule = _isRootTabLocation(widget.matchedLocation)
        ? null
        : AppRegistry.moduleFromLocation(widget.matchedLocation);
    final wasMiniAppRoute =
        oldMatchedLocation != null &&
        AppRegistry.moduleFromLocation(oldMatchedLocation) != null;
    final isMiniAppRoute = activeModule != null;

    if (!isMiniAppRoute) {
      _cachedGlobalBody = _buildGlobalBody();
      _showMiniNav = true;
      _lastLayeredLocation = null;
    } else if (!wasMiniAppRoute ||
        widget.matchedLocation != _lastLayeredLocation) {
      _lastLayeredLocation = widget.matchedLocation;
      _showMiniNav = true;
    }
    _activeLayerPage = isMiniAppRoute ? 1 : 0;
    _syncingLayerPage =
        _layerController.hasClients &&
        _layerController.page?.round() != _activeLayerPage;
    if (_syncingLayerPage) {
      unawaited(
        _layerController
            .animateToPage(
              _activeLayerPage,
              duration: const Duration(milliseconds: 220),
              curve: Curves.easeOutCubic,
            )
            .catchError((_) {})
            .whenComplete(() {
              if (mounted) _setShellState(() => _syncingLayerPage = false);
            }),
      );
    }
  }

  Widget _buildNormalizedChild() {
    return _trackPageScrolling(
      widget.matchedLocation,
      ShellRoutedBody(
        background: (context) => AppearanceScope.hasAmbientBackground(context)
            ? Colors.transparent
            : shad.Theme.of(context).colorScheme.background,
        child: widget.child,
      ),
    );
  }

  Widget _buildGlobalBody() {
    final rootVisible = _isRootTabLocation(_bodyLocation);
    int token(String route) => _rootTabReplayTokens[route] ?? 0;
    return ShellRootBody(
      rootVisible: rootVisible,
      root: !_hasVisitedRoot
          ? null
          : (_) => _trackPageScrolling(
              rootVisible ? widget.matchedLocation : _lastRootLocation,
              LazyIndexedStack(
                animate: true,
                index: _ShellPageState._calculateSelectedIndex(
                  _lastRootLocation,
                ),
                builders: [
                  (_) =>
                      widget.homePageBuilder?.call(token(Routes.home)) ??
                      HomePage(replayToken: token(Routes.home)),
                  (_) =>
                      widget.assistantPageBuilder?.call(
                        token(Routes.assistant),
                      ) ??
                      AssistantPage(
                        shellLocation: widget.matchedLocation,
                        replayToken: token(Routes.assistant),
                      ),
                  (_) => AppsScreen(
                    isActive: widget.matchedLocation == Routes.apps,
                    replayToken: token(Routes.apps),
                  ),
                  (context) =>
                      widget.notificationsPageBuilder?.call(context) ??
                      NotificationsPage(
                        isActive:
                            widget.matchedLocation == Routes.notifications,
                      ),
                  (_) =>
                      widget.profilePageBuilder?.call(
                        token(Routes.profileRoot),
                      ) ??
                      ProfileOverviewPage(
                        replayToken: token(Routes.profileRoot),
                      ),
                ],
              ),
            ),
      detail: (_) => _buildNormalizedChild(),
    );
  }

  // The dock pill plus the gap below and above it, above the system safe
  // area. The dock host adds the safe area once; including it here creates a
  // second gap.
  double _floatingNavBodyInset() =>
      ShellDockMetrics.clearanceFor(MediaQuery.paddingOf(context).bottom);

  Widget _buildCompactLayout(
    BuildContext context,
    AppTabState state, {
    required AppModule? activeModule,
    ShellMiniNavRegistration? injectedMiniNavRegistration,
  }) {
    final l10n = context.l10n;
    final isMiniAppRoute =
        activeModule != null || injectedMiniNavRegistration != null;
    final activeMiniNavItems = isMiniAppRoute
        ? activeModule?.miniAppNavItemsFor(context) ?? const <MiniAppNavItem>[]
        : const <MiniAppNavItem>[];
    final useInjectedMiniNav = injectedMiniNavRegistration != null;
    final isCompact = _usesCompactNavigation(context);
    final selectedKey = useInjectedMiniNav
        ? _injectedMiniSelectedKey(injectedMiniNavRegistration)
        : isMiniAppRoute
        ? _miniSelectedKey(context, activeMiniNavItems)
        : _selectedKeyForLocation(_bodyLocation);
    final globalItems = _buildNavItems(context, l10n);
    final miniItems = useInjectedMiniNav
        ? _buildInjectedMiniNavItems(
            context,
            injectedMiniNavRegistration,
            isCompact,
          )
        : activeModule != null
        ? _buildMiniAppNavItems(context, activeModule, activeMiniNavItems)
        : const <shad.NavigationItem>[];
    final assistantChrome = context.watch<AssistantChromeCubit>().state;
    final immersive =
        context.watch<ShellChromeActionsCubit?>()?.state.immersiveForLocation(
          widget.matchedLocation,
        ) ??
        false;
    final workspace = context.watch<WorkspaceCubit>().state;
    final assistantDock =
        widget.matchedLocation == Routes.assistant &&
        assistantChrome.isLiveMode &&
        (workspace.currentWorkspace ?? workspace.personalWorkspaceOrCurrent) !=
            null;
    final composerVisible =
        widget.matchedLocation == Routes.assistant &&
        assistantChrome.isLiveMode;
    // Chat input and Live call controls share the only dock/exit surface,
    // including immersive mode. Other pages retain their existing policy.
    final showBottomNav =
        assistantDock ||
        ((!widget.matchedLocation.startsWith(Routes.assistant) ||
                !assistantChrome.isFullscreen) &&
            !immersive);
    final injectedBack = injectedMiniNavRegistration?.items
        .where((item) => item.isBack)
        .firstOrNull;
    final backKey = injectedBack == null
        ? _ShellPageState._backToRootKey
        : _injectedMiniNavKey(
            injectedMiniNavRegistration!.ownerId,
            injectedBack.id,
          );
    final navChildren = [
      if (useInjectedMiniNav && injectedBack == null) _defaultBackItem(l10n),
      ...(isMiniAppRoute ? miniItems : globalItems),
    ];
    final back = navChildren.where((item) => item.key == backKey).firstOrNull;
    final navContent = MorphingNavigationBar(
      selectedKey: selectedKey,
      paintSurface: false,
      fixedFrame: true,
      ownsDockZones: false,
      backKey: backKey,
      onBackLongPress: _returnToDestinationRoot,
      onSelected: (key) => key == _ShellPageState._backToRootKey
          ? _runBackNavigation(context)
          : useInjectedMiniNav
          ? _onInjectedMiniNavItemTapped(key, injectedMiniNavRegistration)
          : isMiniAppRoute
          ? _onMiniAppItemTapped(key, context, activeModule, activeMiniNavItems)
          : _onItemTapped(_routeForRootKey(key), context),
      children: navChildren,
    );
    final dockBack = back == null
        ? null
        : ShellDockBackZone(
            back: shellDockEntryFor(back),
            onTap: () => navContent.onSelected(backKey),
            onLongPress: navContent.onBackLongPress,
          );
    final navigationBar = ShellResponsiveDock(
      compact: isCompact,
      compactHeight: _ShellPageState._compactBottomNavHeight,
      child: navContent,
    );
    final globalBody = _buildGlobalBody();
    final windowSize = MediaQuery.sizeOf(context);
    final railMode =
        shellNavigationModeFor(windowSize) == ShellNavigationMode.rail;
    final railVisible = railMode && showBottomNav;
    final showsWorkspacePicker = _isRootTabLocation(widget.matchedLocation);
    final destinations = navChildren
        .where((item) => item.key != backKey)
        .toList();

    return ShellSidebarScaffold(
      location: widget.matchedLocation,
      showSidebar: railVisible,
      includeWorkspacePicker: showsWorkspacePicker,
      compactFooter: showBottomNav && isCompact && !composerVisible
          ? _compactFooter(navigationBar)
          : null,
      back: dockBack,
      items: destinations
          .where((item) => item.key != ShellRootTab.profile.key)
          .toList(),
      selectedKey: selectedKey,
      onSelected: navContent.onSelected,
      onProfileSelected: () =>
          unawaited(_onItemTapped(Routes.profileRoot, context)),
      body: _buildBodyWithFloatingNav(
        body: globalBody,
        header: immersive
            ? null
            : _buildAppBar(
                context,
                activeModule: activeModule,
                injectedMiniNavRegistration: injectedMiniNavRegistration,
                railVisible: railVisible,
              ),
        navigationBar:
            showBottomNav &&
                !railMode &&
                destinations.length > 1 &&
                (!isCompact || composerVisible)
            ? navigationBar
            : null,
        bodyBottomInset: showBottomNav ? _floatingNavBodyInset() : 0,
        composerVisible: composerVisible,
        navigationWidth: ShellDockMetrics.widthFor(windowSize.width),
        hideIdleNavigation: railMode,
        fixedZones: true,
        dockLeading: showBottomNav && !railMode ? dockBack : null,
      ),
    );
  }

  Widget _compactFooter(Widget navigationBar) => ShellCompactFooter(
    background: AppearanceScope.hasAmbientBackground(context)
        ? Colors.transparent
        : shad.Theme.of(context).colorScheme.background,
    child: ShellKeyboardChrome(
      keyboardVisible: MediaQuery.viewInsetsOf(context).bottom > 0,
      child: navigationBar,
    ),
  );

  // Retained for the layered compact-shell variant.
  // ignore: unused_element
  Widget _buildLayeredCompactLayout(
    BuildContext context,
    AppTabState state,
    AppModule activeModule,
  ) {
    final items = activeModule.miniAppNavItemsFor(context);
    final mini = _showMiniNav;
    final compact = _usesCompactNavigation(context);
    final showBottomNav = MediaQuery.viewInsetsOf(context).bottom <= 0;
    final destinations = mini
        ? _buildMiniAppNavItems(context, activeModule, items)
        : _buildNavItems(context, context.l10n);
    final navKey = mini
        ? _ShellPageState._miniLayerKey
        : _ShellPageState._globalLayerKey;
    final selected = mini
        ? _miniSelectedKey(context, items)
        : _selectedKeyForLocation(_bodyLocation);
    void onSelected(Key? key) {
      if (mini) {
        unawaited(_onMiniAppItemTapped(key, context, activeModule, items));
      } else {
        unawaited(_onItemTapped(_routeForRootKey(key), context));
      }
    }

    final navigationBar = ShellLayeredNavigation(
      compact: compact,
      mini: mini,
      navKey: navKey,
      selected: selected,
      destinations: destinations,
      onSelected: onSelected,
      minItemWidth: _ShellPageState._floatingNavMinItemWidth,
      miniBackWidth: _ShellPageState._compactMiniBackButtonMinWidth,
      compactHeight: _ShellPageState._compactBottomNavHeight,
      onHorizontalDragEnd: _onNavBarHorizontalDragEnd,
      wrapGlobal: (navContext, child) => Listener(
        key: navKey,
        behavior: HitTestBehavior.translucent,
        onPointerDown: (event) => _startLongPressTimer(event, navContext),
        onPointerUp: (event) => _handlePointerUp(event, navContext),
        onPointerCancel: _stopLongPressTimer,
        child: child,
      ),
    );
    final pages = ShellLayeredPages(
      controller: _layerController,
      onPageChanged: (page) {
        _setShellState(() {
          _activeLayerPage = page;
          _syncingLayerPage = false;
        });
      },
      globalBody: KeyedSubtree(
        key: _ShellPageState._globalLayerKey,
        child: _cachedGlobalBody ?? const DashboardPage(),
      ),
      miniBody: KeyedSubtree(
        key: _ShellPageState._miniLayerKey,
        child: _buildNormalizedChild(),
      ),
    );
    return shad.Scaffold(
      footers: showBottomNav && compact ? [_compactFooter(navigationBar)] : [],
      child: showBottomNav && !compact
          ? _buildBodyWithFloatingNav(
              body: pages,
              navigationBar: navigationBar,
              bodyBottomInset: _floatingNavBodyInset(),
            )
          : pages,
    );
  }

  shad.AppBar _buildAppBar(
    BuildContext context, {
    required bool railVisible,
    AppModule? activeModule,
    ShellMiniNavRegistration? injectedMiniNavRegistration,
  }) {
    final location = widget.matchedLocation;
    final searchAction = context
        .watch<ShellChromeActionsCubit?>()
        ?.state
        .resolveForLocation(location)
        .where((action) => action.searchController != null)
        .firstOrNull;
    final showsWorkspacePicker = !railVisible && _isRootTabLocation(location);
    return shad.AppBar(
      height: mobileSectionAppBarHeightFor(
        context,
        minimumContentHeight: assistantHeaderContentHeight(
          context,
          location: location,
        ),
      ),
      padding: shellTopBarPaddingFor(MediaQuery.sizeOf(context).width),
      backgroundColor: Colors.transparent,
      trailingGap: 4,
      trailing: searchAction != null
          ? [if (showsWorkspacePicker) const ShellWorkspacePicker()]
          : [
              SizedBox(
                height: mobileSectionAppBarHeight,
                child: railVisible
                    ? ShellInjectedActionsHost(
                        matchedLocation: location,
                        includeSidebarActions: false,
                      )
                    : _ShellTrailingActions(
                        matchedLocation: location,
                        showsWorkspacePicker: showsWorkspacePicker,
                      ),
              ),
            ],
      child: searchAction != null
          ? ShellSearchField(
              key: ValueKey(searchAction.id),
              action: searchAction,
            )
          : SizedBox(
              width: double.infinity,
              child: RepaintBoundary(
                child: ShellRouteFade(
                  kind: ShellRouteFadeKind.title,
                  alignment: AlignmentDirectional.centerStart,
                  // Each location's title has its own route fade layer.
                  child: ShellTopBarTitle(
                    key: ValueKey(location),
                    matchedLocation: location,
                    fallbackTitle: shellSidebarDestinationTitle(
                      context,
                      activeModule: activeModule,
                      registration: injectedMiniNavRegistration,
                      selectedIndex: (items) =>
                          _miniSelectedIndex(location, items),
                    ),
                  ),
                ),
              ),
            ),
    );
  }
}
