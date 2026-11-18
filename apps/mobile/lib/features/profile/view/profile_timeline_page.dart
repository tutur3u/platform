import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/profile/profile_timeline_repository.dart';
import 'package:mobile/features/profile/view/profile_timeline_filter.dart';
import 'package:mobile/features/profile/view/profile_timeline_section.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/floating_shell_dock.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';
import 'package:mobile/features/shell/view/shell_mini_nav.dart';
import 'package:mobile/features/shell/view/shell_title_override.dart';
import 'package:mobile/l10n/l10n.dart';

/// The personal activity timeline, opened from Home. Its own dock carries
/// Back, All and Today; source chips and Search narrow the loaded activity.
class ProfileTimelinePage extends StatefulWidget {
  const ProfileTimelinePage({
    this.cacheUserId,
    this.repository,
    this.now,
    super.key,
  });

  final String? Function()? cacheUserId;

  /// Data source and clock for render tests; production uses the defaults.
  @visibleForTesting
  final ProfileTimelineRepository? repository;
  @visibleForTesting
  final DateTime? now;

  @override
  State<ProfileTimelinePage> createState() => _ProfileTimelinePageState();
}

class _ProfileTimelinePageState extends State<ProfileTimelinePage> {
  static const _ownerId = 'profile-timeline';
  static const Set<String> _locations = {Routes.timeline};

  final _search = TextEditingController();
  var _filter = const ProfileTimelineFilter();
  var _searching = false;

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  void _setFilter(ProfileTimelineFilter filter) {
    if (filter.query != _search.text) _search.text = filter.query;
    setState(() => _filter = filter);
  }

  void _closeSearch() {
    _search.clear();
    setState(() {
      _searching = false;
      _filter = _filter.copyWith(query: '');
    });
  }

  Future<void> _back() async {
    if (_searching) return _closeSearch();
    if (context.canPop()) {
      context.pop();
    } else {
      context.go(Routes.home);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final todayOnly = _filter.todayOnly;
    final everything = !todayOnly && _filter.source == null;
    return Stack(
      fit: StackFit.expand,
      children: [
        LayoutBuilder(
          builder: (context, constraints) => ProfileTimelineSection(
            cacheUserId: widget.cacheUserId,
            repository: widget.repository,
            now: widget.now,
            filter: _filter,
            onFilterChanged: _setFilter,
            contentTopPadding:
                floatingShellHeaderInset(context) + AppLayout.pageTop,
            horizontalPadding: AppPageInsets.resolve(
              width: constraints.maxWidth,
              kind: AppPageKind.root,
              safeArea: MediaQuery.paddingOf(context),
            ),
          ),
        ),
        ShellTitleOverride(
          ownerId: _ownerId,
          locations: _locations,
          title: l10n.profileTimelineTitle,
        ),
        ShellMiniNav(
          ownerId: _ownerId,
          locations: _locations,
          deepLinkBackRoute: Routes.home,
          items: [
            ShellMiniNavItemSpec(
              id: 'back',
              icon: LucideIcons.chevronLeft,
              label: l10n.navBack,
              onPressed: () => unawaited(_back()),
            ),
            ShellMiniNavItemSpec(
              id: 'all',
              icon: LucideIcons.history,
              label: l10n.profileTimelineSourceAll,
              selected: everything,
              callbackToken: _filter,
              onPressed: () => _setFilter(
                _filter.copyWith(todayOnly: false, source: () => null),
              ),
            ),
            ShellMiniNavItemSpec(
              id: 'today',
              icon: LucideIcons.calendarCheck,
              label: l10n.profileTimelineToday,
              selected: todayOnly,
              callbackToken: _filter,
              onPressed: () => _setFilter(_filter.copyWith(todayOnly: true)),
            ),
          ],
        ),
        ShellChromeActions(
          ownerId: _ownerId,
          locations: _locations,
          onBack: _searching ? _back : null,
          actions: [
            ShellActionSpec.search(
              id: 'profile-timeline-search',
              active: _searching,
              hasQuery: _filter.query.isNotEmpty,
              tooltip: l10n.profileTimelineSearch,
              controller: _search,
              searchHint: l10n.profileTimelineSearch,
              onSearchChanged: (query) =>
                  setState(() => _filter = _filter.copyWith(query: query)),
              onCloseSearch: _closeSearch,
              onPressed: () => _searching
                  ? _closeSearch()
                  : setState(() => _searching = true),
            ),
          ],
        ),
      ],
    );
  }
}
