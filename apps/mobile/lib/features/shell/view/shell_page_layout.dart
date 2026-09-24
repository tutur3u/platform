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
    return SizedBox.expand(child: widget.child);
  }

  Widget _buildGlobalBody() {
    final rootVisible = _isRootTabLocation(widget.matchedLocation);
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
                    builder: (bodyContext) => MediaQuery.removePadding(
                      context: bodyContext,
                      removeTop: true,
                      child: LazyIndexedStack(
                        index: _ShellPageState._calculateSelectedIndex(
                          _lastRootLocation,
                        ),
                        builders: [
                          (_) => DashboardPage(
                            replayToken: _rootTabReplayTokens[Routes.home] ?? 0,
                          ),
                          (_) => AssistantPage(
                            replayToken:
                                _rootTabReplayTokens[Routes.assistant] ?? 0,
                          ),
                          (_) => AppsScreen(
                            replayToken: _rootTabReplayTokens[Routes.apps] ?? 0,
                          ),
                          (_) => const NotificationsPage(),
                          (_) => ProfileOverviewPage(
                            replayToken:
                                _rootTabReplayTokens[Routes.profileRoot] ?? 0,
                          ),
                        ],
                      ),
                    ),
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

    final theme = shad.Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
      decoration: BoxDecoration(
        color: theme.colorScheme.background,
        borderRadius: BorderRadius.circular(24),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: isDark ? 0.4 : 0.12),
            blurRadius: 40,
            offset: const Offset(0, 12),
          ),
          BoxShadow(
            color: Colors.black.withValues(alpha: isDark ? 0.2 : 0.08),
            blurRadius: 12,
            offset: const Offset(0, 4),
            spreadRadius: -2,
          ),
        ],
      ),
      child: Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(24),
          border: Border.all(
            color: isDark
                ? Colors.white.withValues(alpha: 0.1)
                : Colors.black.withValues(alpha: 0.08),
          ),
        ),
        child: ClipRRect(borderRadius: BorderRadius.circular(24), child: child),
      ),
    );
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
      color: shad.Theme.of(context).colorScheme.background,
      padding: EdgeInsets.only(bottom: bottomPadding),
      child: navigationBar,
    );
  }

  Widget _buildBodyWithFloatingNav({
    required Widget body,
    required Widget navigationBar,
    double bodyBottomInset = 0,
  }) {
    return FloatingShellDock(
      location: widget.matchedLocation,
      bottomInset: bodyBottomInset,
      navigation: navigationBar,
      onVisibilityChanged: (visible) => _chromeVisible.value = visible,
      child: body,
    );
  }

  double _floatingNavBodyInset() {
    // 48px island + 12px bottom margin + 8px content gap. The caller adds
    // the system safe area once; including it here creates a second gap.
    return 68;
  }

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
        : _selectedKeyForLocation(widget.matchedLocation);
    final globalItems = _buildNavItems(context, state, l10n);
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
    final keyboardVisible = MediaQuery.viewInsetsOf(context).bottom > 0;
    final showBottomNav =
        (!widget.matchedLocation.startsWith(Routes.assistant) ||
            !assistantChrome.isFullscreen) &&
        !keyboardVisible &&
        !immersive;
    final navContent = MorphingNavigationBar(
      selectedKey: selectedKey,
      onSelected: (key) => useInjectedMiniNav
          ? _onInjectedMiniNavItemTapped(key, injectedMiniNavRegistration)
          : isMiniAppRoute
          ? _onMiniAppItemTapped(key, context, activeModule, activeMiniNavItems)
          : _onItemTapped(_ShellPageState._indexForKey(key), context),
      children: isMiniAppRoute ? miniItems : globalItems,
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
    final floatingNavInset = !isCompact && showBottomNav
        ? _floatingNavBodyInset()
        : 0.0;

    return shad.Scaffold(
      headers: [
        if (!immersive)
          ValueListenableBuilder<bool>(
            valueListenable: _chromeVisible,
            builder: (context, visible, _) => AnimatedSize(
              duration: MediaQuery.disableAnimationsOf(context)
                  ? Duration.zero
                  : const Duration(milliseconds: 240),
              curve: Curves.easeOutCubic,
              alignment: Alignment.topCenter,
              child: visible
                  ? _buildAppBar(
                      context,
                      activeModule: activeModule,
                      injectedMiniNavRegistration: injectedMiniNavRegistration,
                    )
                  : const SizedBox.shrink(),
            ),
          ),
      ],
      footers: showBottomNav && isCompact
          ? [
              _buildCompactFooter(
                context: context,
                navigationBar: navigationBar,
              ),
            ]
          : const [],
      // Preserve Assistant state when keyboard/fullscreen hides navigation.
      child: _buildBodyWithFloatingNav(
        body: globalBody,
        navigationBar: showBottomNav && !isCompact
            ? navigationBar
            : const SizedBox.shrink(),
        bodyBottomInset: floatingNavInset,
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
    final globalSelectedKey = _selectedKeyForLocation(widget.matchedLocation);
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
                              onSelected: (key) => _onItemTapped(
                                _ShellPageState._indexForKey(key),
                                context,
                              ),
                              children: _buildNavItems(
                                context,
                                state,
                                context.l10n,
                              ).map((item) => Expanded(child: item)).toList(),
                            )
                          : CustomNavigationBar(
                              key: _ShellPageState._globalLayerKey,
                              selectedKey: globalSelectedKey,
                              onSelected: (key) => _onItemTapped(
                                _ShellPageState._indexForKey(key),
                                context,
                              ),
                              expandItems: false,
                              minItemWidth:
                                  _ShellPageState._floatingNavMinItemWidth,
                              children: _buildNavItems(
                                context,
                                state,
                                context.l10n,
                              ),
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
    final selectedTitle = _selectedMiniNavTitle(
      context,
      activeModule: activeModule,
      injectedMiniNavRegistration: injectedMiniNavRegistration,
    );
    return shad.AppBar(
      height: mobileSectionAppBarHeight,
      padding: mobileSectionAppBarPadding,
      trailingGap: 6,
      trailing: [
        _ShellTrailingActions(matchedLocation: widget.matchedLocation),
      ],
      child: SizedBox(
        width: double.infinity,
        child: RepaintBoundary(
          child: ShellTopBarTitle(
            matchedLocation: widget.matchedLocation,
            fallbackTitle: selectedTitle,
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
