part of 'shell_page.dart';

extension _ShellPageLayout on _ShellPageState {
  void _syncCompactLayoutState({String? oldMatchedLocation}) {
    final activeModule = AppRegistry.moduleFromLocation(widget.matchedLocation);
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
    if (_isRootTabLocation(widget.matchedLocation)) {
      return MediaQuery.removePadding(
        context: context,
        removeTop: true,
        child: IndexedStack(
          index: _ShellPageState._calculateSelectedIndex(
            widget.matchedLocation,
          ),
          children: [
            DashboardPage(replayToken: _rootTabReplayTokens[Routes.home] ?? 0),
            AssistantPage(
              replayToken: _rootTabReplayTokens[Routes.assistant] ?? 0,
            ),
            AppsHubPage(replayToken: _rootTabReplayTokens[Routes.apps] ?? 0),
          ],
        ),
      );
    }

    return _buildNormalizedChild();
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
      margin: const EdgeInsets.symmetric(horizontal: 40, vertical: 24),
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
        child: ClipRRect(
          borderRadius: BorderRadius.circular(24),
          child: child,
        ),
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
      width: double.infinity,
      child: Center(
        child: ConstrainedBox(
          constraints: BoxConstraints(maxWidth: maxWidth > 0 ? maxWidth : 0),
          child: IntrinsicWidth(child: child),
        ),
      ),
    );
  }

  Widget _buildBodyWithFloatingNav({
    required Widget body,
    required Widget navigationBar,
    double bodyBottomInset = 0,
  }) {
    final mediaQuery = MediaQuery.of(context);
    final effectiveBody = bodyBottomInset > 0
        ? MediaQuery(
            data: mediaQuery.copyWith(
              padding: mediaQuery.padding.copyWith(
                bottom: mediaQuery.padding.bottom + bodyBottomInset,
              ),
              viewPadding: mediaQuery.viewPadding.copyWith(
                bottom: mediaQuery.viewPadding.bottom + bodyBottomInset,
              ),
            ),
            child: body,
          )
        : body;

    return Stack(
      fit: StackFit.expand,
      children: [
        effectiveBody,
        Positioned(
          left: 0,
          right: 0,
          bottom: 0,
          child: SafeArea(top: false, child: navigationBar),
        ),
      ],
    );
  }

  double _floatingNavBodyInset(BuildContext context) {
    return 132 + MediaQuery.paddingOf(context).bottom;
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
          )
        : activeModule != null
        ? _buildMiniAppNavItems(context, activeModule, activeMiniNavItems)
        : const <shad.NavigationItem>[];
    final assistantChrome = context.watch<AssistantChromeCubit>().state;
    final keyboardVisible = MediaQuery.viewInsetsOf(context).bottom > 0;
    final showBottomNav =
        (!widget.matchedLocation.startsWith(Routes.assistant) ||
            !assistantChrome.isFullscreen) &&
        !keyboardVisible;
    final isCompact = context.isCompact;
    final compactMiniItems = isMiniAppRoute
        ? <Widget>[
            ConstrainedBox(
              constraints: const BoxConstraints(
                minWidth: _ShellPageState._compactMiniBackButtonMinWidth,
              ),
              child: miniItems.first,
            ),
            ...miniItems.skip(1).map((item) => Expanded(child: item)),
          ]
        : const <Widget>[];
    final navVariantKey = ValueKey<String>(
      useInjectedMiniNav
          ? 'mini-nav-${injectedMiniNavRegistration.ownerId}'
          : activeModule != null
          ? 'mini-nav-${activeModule.id}'
          : 'global-nav',
    );
    final navContent = isCompact
        ? shad.NavigationBar(
            key: navVariantKey,
            selectedKey: selectedKey,
            padding: EdgeInsets.symmetric(
              horizontal: isMiniAppRoute ? 4 : 8,
              vertical: 4,
            ),
            onSelected: (key) => useInjectedMiniNav
                ? _onInjectedMiniNavItemTapped(
                    key,
                    injectedMiniNavRegistration,
                  )
                : isMiniAppRoute
                ? _onMiniAppItemTapped(
                    key,
                    context,
                    activeModule,
                    activeMiniNavItems,
                  )
                : _onItemTapped(
                    _ShellPageState._indexForKey(key),
                    context,
                  ),
            children: isMiniAppRoute
                ? compactMiniItems
                : globalItems.map((item) => Expanded(child: item)).toList(),
          )
        : CustomNavigationBar(
            key: navVariantKey,
            selectedKey: selectedKey,
            onSelected: (key) => useInjectedMiniNav
                ? _onInjectedMiniNavItemTapped(
                    key,
                    injectedMiniNavRegistration,
                  )
                : isMiniAppRoute
                ? _onMiniAppItemTapped(
                    key,
                    context,
                    activeModule,
                    activeMiniNavItems,
                  )
                : _onItemTapped(
                    _ShellPageState._indexForKey(key),
                    context,
                  ),
            expandItems: false,
            minItemWidth: _ShellPageState._floatingNavMinItemWidth,
            children: isMiniAppRoute ? miniItems : globalItems,
          );
    final navigationBar = _buildNavigationBarContainer(
      context: context,
      isCompact: isCompact,
      child: _buildFloatingNavigationBar(
        context: context,
        isCompact: isCompact,
        child: Listener(
          behavior: HitTestBehavior.translucent,
          onPointerDown: isMiniAppRoute ? null : _startLongPressTimer,
          onPointerUp: isMiniAppRoute ? null : _handlePointerUp,
          onPointerCancel: isMiniAppRoute ? null : _stopLongPressTimer,
          child: AnimatedSwitcher(
            duration: const Duration(milliseconds: 220),
            switchInCurve: Curves.easeOutCubic,
            switchOutCurve: Curves.easeInCubic,
            layoutBuilder: (currentChild, previousChildren) => Stack(
              alignment: Alignment.center,
              children: [
                ...previousChildren,
                if (currentChild != null) currentChild,
              ],
            ),
            transitionBuilder: (child, animation) {
              final slideAnimation = Tween<Offset>(
                begin: const Offset(0.05, 0),
                end: Offset.zero,
              ).animate(animation);
              return FadeTransition(
                opacity: animation,
                child: SlideTransition(position: slideAnimation, child: child),
              );
            },
            child: RepaintBoundary(child: navContent),
          ),
        ),
      ),
    );
    final globalBody = _buildGlobalBody();
    final floatingNavInset = !isCompact && showBottomNav
        ? _floatingNavBodyInset(context)
        : 0.0;

    return shad.Scaffold(
      headers: [_buildAppBar(context)],
      footers: showBottomNav && isCompact
          ? [SafeArea(top: false, child: navigationBar)]
          : const [],
      child: showBottomNav && !isCompact
          ? _buildBodyWithFloatingNav(
              body: globalBody,
              navigationBar: navigationBar,
              bodyBottomInset: floatingNavInset,
            )
          : globalBody,
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
    final miniSelectedKey = _miniSelectedKey(
      context,
      activeMiniNavItems,
    );
    final globalSelectedKey = _selectedKeyForLocation(widget.matchedLocation);
    final isCompact = context.isCompact;
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
                : Listener(
                    behavior: HitTestBehavior.translucent,
                    onPointerDown: _startLongPressTimer,
                    onPointerUp: _handlePointerUp,
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
        KeyedSubtree(
          key: _ShellPageState._globalLayerKey,
          child: globalBody,
        ),
        KeyedSubtree(
          key: _ShellPageState._miniLayerKey,
          child: _buildNormalizedChild(),
        ),
      ],
    );

    return shad.Scaffold(
      footers: showBottomNav && isCompact
          ? [SafeArea(top: false, child: navigationBar)]
          : const [],
      child: showBottomNav && !isCompact
          ? _buildBodyWithFloatingNav(
              body: pageView,
              navigationBar: navigationBar,
              bodyBottomInset: _floatingNavBodyInset(context),
            )
          : pageView,
    );
  }

  shad.AppBar _buildAppBar(BuildContext context) {
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
          child: ShellTopBarTitle(matchedLocation: widget.matchedLocation),
        ),
      ),
    );
  }
}

class _ShellTrailingActions extends StatelessWidget {
  const _ShellTrailingActions({required this.matchedLocation});

  final String matchedLocation;

  @override
  Widget build(BuildContext context) {
    final titleOverrideCubit = lookupShellTitleOverrideCubit(context);
    if (titleOverrideCubit == null) {
      return _buildActions();
    }

    return BlocBuilder<ShellTitleOverrideCubit, ShellTitleOverrideState>(
      bloc: titleOverrideCubit,
      buildWhen: (previous, current) =>
          previous.showAvatarForLocation(matchedLocation) !=
          current.showAvatarForLocation(matchedLocation),
      builder: (context, state) {
        if (!state.showAvatarForLocation(matchedLocation)) {
          return const SizedBox.shrink();
        }

        return _buildActions();
      },
    );
  }

  Widget _buildActions() {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        ShellInjectedActionsHost(matchedLocation: matchedLocation),
        const SizedBox(width: 6),
        KeyedSubtree(
          key: _ShellPageState._shellNotificationsKey,
          child: RepaintBoundary(
            child: ShellNotificationsActionSlot(
              matchedLocation: matchedLocation,
            ),
          ),
        ),
        const SizedBox(width: 6),
        _ShellAvatarSlot(matchedLocation: matchedLocation),
      ],
    );
  }
}

class _ShellAvatarSlot extends StatelessWidget {
  const _ShellAvatarSlot({required this.matchedLocation});

  final String matchedLocation;

  @override
  Widget build(BuildContext context) {
    final titleOverrideCubit = lookupShellTitleOverrideCubit(context);
    if (titleOverrideCubit == null) {
      return const KeyedSubtree(
        key: _ShellPageState._shellAvatarKey,
        child: RepaintBoundary(child: AvatarDropdown()),
      );
    }

    return BlocBuilder<ShellTitleOverrideCubit, ShellTitleOverrideState>(
      bloc: titleOverrideCubit,
      buildWhen: (previous, current) =>
          previous.showAvatarForLocation(matchedLocation) !=
          current.showAvatarForLocation(matchedLocation),
      builder: (context, state) {
        if (!state.showAvatarForLocation(matchedLocation)) {
          return const SizedBox.shrink();
        }

        return const KeyedSubtree(
          key: _ShellPageState._shellAvatarKey,
          child: RepaintBoundary(child: AvatarDropdown()),
        );
      },
    );
  }
}
