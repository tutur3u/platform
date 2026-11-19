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
      _activeLayerPage = 0;
      _showMiniNav = true;
      _lastLayeredLocation = null;

      if (_layerController.hasClients && _layerController.page?.round() != 0) {
        _syncingLayerPage = true;
        unawaited(
          _layerController
              .animateToPage(
                0,
                duration: const Duration(milliseconds: 220),
                curve: Curves.easeOutCubic,
              )
              .catchError((_) {})
              .whenComplete(() {
                if (!mounted) return;
                _setShellState(() => _syncingLayerPage = false);
              }),
        );
      } else {
        _syncingLayerPage = false;
      }

      return;
    }

    _activeLayerPage = 1;
    if (!wasMiniAppRoute || widget.matchedLocation != _lastLayeredLocation) {
      _lastLayeredLocation = widget.matchedLocation;
      _showMiniNav = true;
    }

    if (_layerController.hasClients && _layerController.page?.round() != 1) {
      _syncingLayerPage = true;
      unawaited(
        _layerController
            .animateToPage(
              1,
              duration: const Duration(milliseconds: 220),
              curve: Curves.easeOutCubic,
            )
            .catchError((_) {})
            .whenComplete(() {
              if (!mounted) return;
              _setShellState(() => _syncingLayerPage = false);
            }),
      );
    } else {
      _syncingLayerPage = false;
    }
  }

  Widget _buildNormalizedChild() {
    return _trackPageScrolling(
      widget.matchedLocation,
      Builder(
        builder: (bodyContext) => MediaQuery.removePadding(
          context: bodyContext,
          removeTop: true,
          child: Theme(
            data: Theme.of(bodyContext).copyWith(
              scaffoldBackgroundColor:
                  AppearanceScope.hasAmbientBackground(bodyContext)
                  ? Colors.transparent
                  : shad.Theme.of(bodyContext).colorScheme.background,
            ),
            child: SizedBox.expand(child: widget.child),
          ),
        ),
      ),
    );
  }

  Widget _buildGlobalBody() {
    final rootVisible = _isRootTabLocation(_bodyLocation);
    return Stack(
      fit: StackFit.expand,
      children: [
        Offstage(
          offstage: !rootVisible,
          child: TickerMode(
            enabled: rootVisible,
            child: !_hasVisitedRoot
                ? const SizedBox.shrink()
                : Builder(
                    builder: (bodyContext) {
                      final media = MediaQuery.of(bodyContext);
                      return MediaQuery(
                        // Root pages add their own scroll clearance for the
                        // floating header. Keep the physical status-bar inset
                        // available while removing automatic top padding.
                        data: media
                            .removePadding(removeTop: true)
                            .copyWith(viewPadding: media.viewPadding),
                        child: _trackPageScrolling(
                          rootVisible
                              ? widget.matchedLocation
                              : _lastRootLocation,
                          LazyIndexedStack(
                            // Body transitions are separate from the persistent
                            // dock; outgoing bodies own no dock.
                            animate: true,
                            index: _ShellPageState._calculateSelectedIndex(
                              _lastRootLocation,
                            ),
                            builders: [
                              (_) =>
                                  widget.homePageBuilder?.call(
                                    _rootTabReplayTokens[Routes.home] ?? 0,
                                  ) ??
                                  HomePage(
                                    replayToken:
                                        _rootTabReplayTokens[Routes.home] ?? 0,
                                  ),
                              (_) =>
                                  widget.assistantPageBuilder?.call(
                                    _rootTabReplayTokens[Routes.assistant] ?? 0,
                                  ) ??
                                  AssistantPage(
                                    shellLocation: widget.matchedLocation,
                                    replayToken:
                                        _rootTabReplayTokens[Routes
                                            .assistant] ??
                                        0,
                                  ),
                              (_) => AppsScreen(
                                isActive: widget.matchedLocation == Routes.apps,
                                replayToken:
                                    _rootTabReplayTokens[Routes.apps] ?? 0,
                              ),
                              (context) =>
                                  widget.notificationsPageBuilder?.call(
                                    context,
                                  ) ??
                                  NotificationsPage(
                                    isActive:
                                        widget.matchedLocation ==
                                        Routes.notifications,
                                  ),
                              (_) {
                                final token =
                                    _rootTabReplayTokens[Routes.profileRoot] ??
                                    0;
                                return widget.profilePageBuilder?.call(token) ??
                                    ProfileOverviewPage(replayToken: token);
                              },
                            ],
                          ),
                        ),
                      );
                    },
                  ),
          ),
        ),
        if (!rootVisible) _buildNormalizedChild(),
      ],
    );
  }

  Widget _buildFloatingNavigationBar({
    required BuildContext context,
    required bool isCompact,
    required Widget child,
  }) {
    if (isCompact) {
      return child;
    }

    // The morphing island owns its glass, outline and glow. A second surface
    // here leaves a visible double stroke around the floating navigation.
    return Padding(padding: EdgeInsets.zero, child: child);
  }

  Widget _buildNavigationBarContainer({
    required BuildContext context,
    required bool isCompact,
    required Widget child,
  }) {
    if (isCompact) {
      return SizedBox(
        width: double.infinity,
        height:
            _ShellPageState._compactBottomNavHeight +
            (MediaQuery.textScalerOf(context).scale(10) - 10).clamp(
                  0,
                  double.infinity,
                ) *
                1.6,
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 560),
            child: child,
          ),
        ),
      );
    }

    final maxWidth = MediaQuery.sizeOf(context).width - 24;

    return SizedBox(
      child: Center(
        widthFactor: 1,
        heightFactor: 1,
        child: ConstrainedBox(
          constraints: BoxConstraints(maxWidth: maxWidth > 0 ? maxWidth : 0),
          child: child,
        ),
      ),
    );
  }

  Widget _buildCompactFooter({
    required BuildContext context,
    required Widget navigationBar,
  }) {
    final systemBottomInset = MediaQuery.viewPaddingOf(context).bottom;
    final bottomPadding = systemBottomInset <= 0
        ? 0.0
        : (systemBottomInset * 0.42).clamp(10.0, 16.0);

    return Container(
      key: const ValueKey('compact-shell-footer'),
      color: AppearanceScope.hasAmbientBackground(context)
          ? Colors.transparent
          : shad.Theme.of(context).colorScheme.background,
      padding: EdgeInsets.only(bottom: bottomPadding),
      child: ShellKeyboardChrome(
        keyboardVisible: MediaQuery.viewInsetsOf(context).bottom > 0,
        child: navigationBar,
      ),
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
    return _buildGlobalCompactScaffold(
      context,
      state,
      activeModule: activeModule,
      injectedMiniNavRegistration: injectedMiniNavRegistration,
    );
  }

  Widget _buildGlobalCompactScaffold(
    BuildContext context,
    AppTabState state, {
    AppModule? activeModule,
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
      onBackLongPress: () => unawaited(_returnToDestinationRoot()),
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
    final navigationBar = _buildNavigationBarContainer(
      context: context,
      isCompact: isCompact,
      child: _buildFloatingNavigationBar(
        context: context,
        isCompact: isCompact,
        child: navContent,
      ),
    );
    final globalBody = _buildGlobalBody();
    final floatingNavInset = showBottomNav ? _floatingNavBodyInset() : 0.0;
    final railMode =
        shellNavigationModeFor(MediaQuery.sizeOf(context)) ==
        ShellNavigationMode.rail;
    final destinations = navChildren
        .where((item) => item.key != backKey)
        .toList();

    return shad.Scaffold(
      footers: showBottomNav && isCompact && !composerVisible
          ? [
              _buildCompactFooter(
                context: context,
                navigationBar: navigationBar,
              ),
            ]
          : const [],
      // Preserve Assistant state when keyboard/fullscreen hides navigation.
      child: AdaptiveShellFrame(
        rail: railMode && showBottomNav
            ? destinations.isEmpty && dockBack == null
                  ? const SizedBox.shrink()
                  : ShellNavigationRail(
                      leading: dockBack,
                      items: destinations,
                      selectedKey: selectedKey,
                      onSelected: navContent.onSelected,
                    )
            : null,
        body: _buildBodyWithFloatingNav(
          body: globalBody,
          header: immersive
              ? null
              : _buildAppBar(
                  context,
                  activeModule: activeModule,
                  injectedMiniNavRegistration: injectedMiniNavRegistration,
                ),
          navigationBar:
              showBottomNav &&
                  !railMode &&
                  destinations.length > 1 &&
                  (!isCompact || composerVisible)
              ? navigationBar
              : null,
          bodyBottomInset: floatingNavInset,
          composerVisible: composerVisible,
          navigationWidth: ShellDockMetrics.widthFor(
            MediaQuery.sizeOf(context).width,
          ),
          hideIdleNavigation: railMode,
          fixedZones: true,
          dockLeading: showBottomNav && !railMode ? dockBack : null,
        ),
      ),
    );
  }

  // Retained while the layered compact-shell variant is still under review.
  // ignore: unused_element
  Widget _buildLayeredCompactLayout(
    BuildContext context,
    AppTabState state,
    AppModule activeModule,
  ) {
    final globalBody = _cachedGlobalBody ?? const DashboardPage();
    final activeMiniNavItems = activeModule.miniAppNavItemsFor(context);
    final miniItems = _buildMiniAppNavItems(
      context,
      activeModule,
      activeMiniNavItems,
    );
    final miniSelectedKey = _miniSelectedKey(context, activeMiniNavItems);
    final globalSelectedKey = _selectedKeyForLocation(_bodyLocation);
    final isCompact = _usesCompactNavigation(context);
    final showBottomNav = MediaQuery.viewInsetsOf(context).bottom <= 0;
    final compactMiniItems = <Widget>[
      ConstrainedBox(
        constraints: const BoxConstraints(
          minWidth: _ShellPageState._compactMiniBackButtonMinWidth,
        ),
        child: miniItems.first,
      ),
      ...miniItems.skip(1).map((item) => Expanded(child: item)),
    ];
    final navigationBar = _buildNavigationBarContainer(
      context: context,
      isCompact: isCompact,
      child: _buildFloatingNavigationBar(
        context: context,
        isCompact: isCompact,
        child: GestureDetector(
          behavior: HitTestBehavior.translucent,
          onHorizontalDragEnd: _onNavBarHorizontalDragEnd,
          child: AnimatedSwitcher(
            duration: const Duration(milliseconds: 180),
            switchInCurve: Curves.easeOutCubic,
            switchOutCurve: Curves.easeInCubic,
            child: _showMiniNav
                ? (isCompact
                      ? shad.NavigationBar(
                          key: _ShellPageState._miniLayerKey,
                          selectedKey: miniSelectedKey,
                          padding: const EdgeInsets.symmetric(
                            horizontal: 4,
                            vertical: 4,
                          ),
                          onSelected: (key) => _onMiniAppItemTapped(
                            key,
                            context,
                            activeModule,
                            activeMiniNavItems,
                          ),
                          children: compactMiniItems,
                        )
                      : CustomNavigationBar(
                          key: _ShellPageState._miniLayerKey,
                          selectedKey: miniSelectedKey,
                          onSelected: (key) => _onMiniAppItemTapped(
                            key,
                            context,
                            activeModule,
                            activeMiniNavItems,
                          ),
                          expandItems: false,
                          minItemWidth:
                              _ShellPageState._floatingNavMinItemWidth,
                          children: miniItems,
                        ))
                : Builder(
                    builder: (navContext) => Listener(
                      behavior: HitTestBehavior.translucent,
                      onPointerDown: (event) =>
                          _startLongPressTimer(event, navContext),
                      onPointerUp: (event) =>
                          _handlePointerUp(event, navContext),
                      onPointerCancel: _stopLongPressTimer,
                      child: isCompact
                          ? shad.NavigationBar(
                              key: _ShellPageState._globalLayerKey,
                              selectedKey: globalSelectedKey,
                              padding: const EdgeInsets.symmetric(
                                horizontal: 8,
                                vertical: 4,
                              ),
                              onSelected: (key) =>
                                  _onItemTapped(_routeForRootKey(key), context),
                              children: _buildNavItems(
                                context,
                                context.l10n,
                              ).map((item) => Expanded(child: item)).toList(),
                            )
                          : CustomNavigationBar(
                              key: _ShellPageState._globalLayerKey,
                              selectedKey: globalSelectedKey,
                              onSelected: (key) =>
                                  _onItemTapped(_routeForRootKey(key), context),
                              expandItems: false,
                              minItemWidth:
                                  _ShellPageState._floatingNavMinItemWidth,
                              children: _buildNavItems(context, context.l10n),
                            ),
                    ),
                  ),
          ),
        ),
      ),
    );
    final pageView = PageView(
      controller: _layerController,
      physics: const NeverScrollableScrollPhysics(),
      onPageChanged: (page) {
        _setShellState(() {
          _activeLayerPage = page;
          _syncingLayerPage = false;
        });
      },
      children: [
        KeyedSubtree(key: _ShellPageState._globalLayerKey, child: globalBody),
        KeyedSubtree(
          key: _ShellPageState._miniLayerKey,
          child: _buildNormalizedChild(),
        ),
      ],
    );

    return shad.Scaffold(
      footers: showBottomNav && isCompact
          ? [
              _buildCompactFooter(
                context: context,
                navigationBar: navigationBar,
              ),
            ]
          : const [],
      child: showBottomNav && !isCompact
          ? _buildBodyWithFloatingNav(
              body: pageView,
              navigationBar: navigationBar,
              bodyBottomInset: _floatingNavBodyInset(),
            )
          : pageView,
    );
  }

  shad.AppBar _buildAppBar(
    BuildContext context, {
    AppModule? activeModule,
    ShellMiniNavRegistration? injectedMiniNavRegistration,
  }) {
    final searchAction = context
        .watch<ShellChromeActionsCubit?>()
        ?.state
        .resolveForLocation(widget.matchedLocation)
        .where((action) => action.searchController != null)
        .firstOrNull;
    if (searchAction != null) {
      return shad.AppBar(
        height: mobileSectionAppBarHeightFor(
          context,
          minimumContentHeight: assistantHeaderContentHeight(
            context,
            location: widget.matchedLocation,
          ),
        ),
        padding: shellTopBarPaddingFor(MediaQuery.sizeOf(context).width),
        backgroundColor: Colors.transparent,
        trailingGap: 4,
        trailing: [
          if (_isRootTabLocation(widget.matchedLocation))
            const ShellWorkspacePicker(),
        ],
        child: ShellSearchField(
          key: ValueKey(searchAction.id),
          action: searchAction,
        ),
      );
    }
    final selectedTitle = _selectedMiniNavTitle(
      context,
      activeModule: activeModule,
      injectedMiniNavRegistration: injectedMiniNavRegistration,
    );
    return shad.AppBar(
      height: mobileSectionAppBarHeightFor(
        context,
        minimumContentHeight: assistantHeaderContentHeight(
          context,
          location: widget.matchedLocation,
        ),
      ),
      padding: shellTopBarPaddingFor(MediaQuery.sizeOf(context).width),
      backgroundColor: Colors.transparent,
      trailingGap: 4,
      trailing: [
        SizedBox(
          height: mobileSectionAppBarHeight,
          child: _ShellTrailingActions(
            matchedLocation: widget.matchedLocation,
            showsWorkspacePicker: _isRootTabLocation(widget.matchedLocation),
          ),
        ),
      ],
      child: SizedBox(
        width: double.infinity,
        child: RepaintBoundary(
          child: ShellRouteFade(
            kind: ShellRouteFadeKind.title,
            alignment: AlignmentDirectional.centerStart,
            // Each location's title is its own layer for the route fade.
            child: ShellTopBarTitle(
              key: ValueKey(widget.matchedLocation),
              matchedLocation: widget.matchedLocation,
              fallbackTitle: selectedTitle,
            ),
          ),
        ),
      ),
    );
  }

  String? _selectedMiniNavTitle(
    BuildContext context, {
    AppModule? activeModule,
    ShellMiniNavRegistration? injectedMiniNavRegistration,
  }) {
    if (injectedMiniNavRegistration != null) {
      for (final item in injectedMiniNavRegistration.items) {
        if (item.selected) {
          return item.label;
        }
      }
    }

    if (activeModule == null) {
      return null;
    }

    final items = activeModule.miniAppNavItemsFor(context);
    if (items.isEmpty) {
      return activeModule.label(context.l10n);
    }

    return items[_miniSelectedIndex(widget.matchedLocation, items)].label(
      context.l10n,
    );
  }
}
