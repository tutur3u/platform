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
          index: _rootTabIndex(widget.matchedLocation),
          children: const [DashboardPage(), AssistantPage(), AppsHubPage()],
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

  Widget _buildCompactLayout(
    BuildContext context,
    AppTabState state, {
    required AppModule? activeModule,
  }) {
    if (activeModule == null) {
      return _buildGlobalCompactScaffold(context, state);
    }

    return _buildLayeredCompactLayout(context, state, activeModule);
  }

  Widget _buildGlobalCompactScaffold(BuildContext context, AppTabState state) {
    final l10n = context.l10n;
    final items = _buildNavItems(context, state, l10n);
    final selectedKey = _selectedKeyForLocation(widget.matchedLocation);
    final assistantChrome = context.watch<AssistantChromeCubit>().state;
    final showBottomNav =
        !widget.matchedLocation.startsWith(Routes.assistant) ||
        !assistantChrome.isFullscreen;
    final isCompact = context.isCompact;

    return shad.Scaffold(
      headers: [_buildAppBar(context)],
      footers: showBottomNav
          ? [
              SafeArea(
                top: false,
                child: SizedBox(
                  width: double.infinity,
                  child: Center(
                    child: ConstrainedBox(
                      constraints: BoxConstraints(
                        maxWidth: isCompact ? 560 : 720,
                      ),
                      child: _buildFloatingNavigationBar(
                        context: context,
                        isCompact: isCompact,
                        child: Listener(
                          behavior: HitTestBehavior.translucent,
                          onPointerDown: _startLongPressTimer,
                          onPointerUp: _handlePointerUp,
                          onPointerCancel: _stopLongPressTimer,
                          child: isCompact
                              ? shad.NavigationBar(
                                  selectedKey: selectedKey,
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 8,
                                    vertical: 4,
                                  ),
                                  onSelected: (key) => _onItemTapped(
                                    _ShellPageState._indexForKey(key),
                                    context,
                                  ),
                                  children: items
                                      .map((item) => Expanded(child: item))
                                      .toList(),
                                )
                              : CustomNavigationBar(
                                  selectedKey: selectedKey,
                                  onSelected: (key) => _onItemTapped(
                                    _ShellPageState._indexForKey(key),
                                    context,
                                  ),
                                  children: items,
                                ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ]
          : const [],
      child: _buildGlobalBody(),
    );
  }

  Widget _buildLayeredCompactLayout(
    BuildContext context,
    AppTabState state,
    AppModule activeModule,
  ) {
    final globalBody = _cachedGlobalBody ?? const DashboardPage();
    final miniItems = _buildMiniAppNavItems(context, activeModule);
    final miniSelectedKey = _miniSelectedKey(
      context,
      activeModule.miniAppNavItems,
    );
    final globalSelectedKey = _selectedKeyForLocation(widget.matchedLocation);
    final isCompact = context.isCompact;

    return shad.Scaffold(
      footers: [
        SafeArea(
          top: false,
          child: SizedBox(
            width: double.infinity,
            child: Center(
              child: ConstrainedBox(
                constraints: BoxConstraints(
                  maxWidth: isCompact ? 560 : 720,
                ),
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
                                      horizontal: 8,
                                      vertical: 4,
                                    ),
                                    onSelected: (key) => _onMiniAppItemTapped(
                                      key,
                                      context,
                                      activeModule,
                                    ),
                                    children: miniItems
                                        .map((item) => Expanded(child: item))
                                        .toList(),
                                  )
                                : CustomNavigationBar(
                                    key: _ShellPageState._miniLayerKey,
                                    selectedKey: miniSelectedKey,
                                    onSelected: (key) => _onMiniAppItemTapped(
                                      key,
                                      context,
                                      activeModule,
                                    ),
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
                                      children:
                                          _buildNavItems(
                                                context,
                                                state,
                                                context.l10n,
                                              )
                                              .map(
                                                (item) => Expanded(child: item),
                                              )
                                              .toList(),
                                    )
                                  : CustomNavigationBar(
                                      key: _ShellPageState._globalLayerKey,
                                      selectedKey: globalSelectedKey,
                                      onSelected: (key) => _onItemTapped(
                                        _ShellPageState._indexForKey(key),
                                        context,
                                      ),
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
            ),
          ),
        ),
      ],
      child: PageView(
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
      ),
    );
  }

  shad.AppBar _buildAppBar(BuildContext context) {
    return shad.AppBar(
      height: mobileSectionAppBarHeight,
      padding: mobileSectionAppBarPadding,
      trailingGap: 6,
      trailing: const [AvatarDropdown()],
      child: ShellTopBarTitle(matchedLocation: widget.matchedLocation),
    );
  }
}
