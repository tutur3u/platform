import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/apps/cubit/app_tab_cubit.dart';
import 'package:mobile/features/apps/cubit/app_tab_state.dart';
import 'package:mobile/features/apps/view/apps_hub_page.dart';
import 'package:mobile/features/apps/view/apps_hub_results.dart';
import 'package:mobile/features/apps/widgets/apps_picker_editor.dart';
import 'package:mobile/features/settings/cubit/experimental_apps_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/shell_brand_title.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/order_editor_sheet.dart';

/// The whole brand/name control opens the same Apps surface as the Apps page.
class AppsDropdownPicker extends StatelessWidget {
  const AppsDropdownPicker({this.title, super.key});
  final String? title;

  @override
  Widget build(BuildContext context) => Semantics(
    button: true,
    label:
        '${title ?? context.l10n.navApps}, ${context.l10n.appsHubSearchHint}',
    child: Tooltip(
      message: context.l10n.navApps,
      excludeFromSemantics: true,
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () => unawaited(showAppsPicker(context)),
        child: ExcludeSemantics(
          child: ShellBrandTitle(title: title ?? context.l10n.navApps),
        ),
      ),
    ),
  );
}

/// Opens the persistent Apps screen through the shared shell.
Future<void> showAppsPicker(
  BuildContext context, {
  bool searchInitially = false,
}) async {
  final tabs = context.read<AppTabCubit>();
  if (searchInitially) {
    await tabs.openWithSearch();
  } else {
    await tabs.clearSelection();
  }
  if (context.mounted) context.go(Routes.apps);
}

class AppsScreen extends StatefulWidget {
  const AppsScreen({this.replayToken = 0, this.isActive = true, super.key});
  final int replayToken;
  final bool isActive;

  @override
  State<AppsScreen> createState() => _AppsScreenState();
}

class _AppsScreenState extends State<AppsScreen> {
  final _search = TextEditingController();
  bool _searching = false;
  bool _showGrid = true;
  String? _pendingSubmit;
  bool _launchQueued = false;

  @override
  void initState() {
    super.initState();
    _searching = context.read<AppTabCubit>().state.shouldAutoFocus;
    if (_searching) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) context.read<AppTabCubit>().consumeAutoFocus();
      });
    }
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  void _submitSearch(String submitted) {
    if (!widget.isActive ||
        !_searching ||
        _pendingSubmit != null ||
        _launchQueued) {
      return;
    }
    final query = _search.text.trim().toLowerCase();
    if (query.isEmpty || submitted.trim().toLowerCase() != query) return;
    setState(() => _pendingSubmit = query);
  }

  void _scheduleSearchSelection(BuildContext context) {
    final query = _pendingSubmit;
    if (query == null) return;
    _pendingSubmit = null;
    // Resolve availability during build, using the same live dependencies and
    // filter as the displayed hub, rather than a debounced result snapshot.
    final tabs = context.read<AppTabCubit>();
    final matches = appsHubResults(context, tabs, query);
    if (matches.length != 1) return;
    final module = matches.single;
    final availability = appsHubAvailability(context);
    _launchQueued = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _launchQueued = false;
      if (!mounted ||
          !widget.isActive ||
          !_searching ||
          _search.text.trim().toLowerCase() != query ||
          GoRouter.of(context).routeInformationProvider.value.uri.path !=
              Routes.apps) {
        return;
      }
      // Read current states directly; inherited notifications can still be
      // pending when an earlier post-frame callback changes availability.
      if (appsHubAvailability(context) != availability) return;
      if ((context as Element).dirty) {
        setState(() => _pendingSubmit = query);
        return;
      }
      // Clear and close synchronously before launch: repeated IME actions
      // cannot launch a second app or retain stale search when returning.
      setState(() {
        _searching = false;
        _search.clear();
      });
      FocusManager.instance.primaryFocus?.unfocus();
      unawaited(tabs.select(module));
      context.go(module.route);
    });
  }

  @override
  Widget build(BuildContext context) {
    _scheduleSearchSelection(context);
    return BlocListener<AppTabCubit, AppTabState>(
      listenWhen: (previous, current) =>
          !previous.shouldAutoFocus && current.shouldAutoFocus,
      listener: (context, state) {
        setState(() => _searching = true);
        context.read<AppTabCubit>().consumeAutoFocus();
      },
      child: Column(
        key: const ValueKey('apps-screen'),
        children: [
          ShellChromeActions(
            ownerId: 'apps-screen',
            locations: const {Routes.apps},
            actions: [
              ShellActionSpec(
                id: 'apps-search',
                inDock: true,
                icon: _searching
                    ? Icons.search_off_rounded
                    : Icons.search_rounded,
                tooltip: context.l10n.appsHubSearchHint,
                callbackToken: 'search-$_searching',
                searchController: _searching ? _search : null,
                searchHint: context.l10n.appsHubSearchHint,
                onSearchChanged: (_) => setState(() {}),
                onSearchSubmitted: _submitSearch,
                onCloseSearch: () => setState(() {
                  _searching = false;
                  _search.clear();
                }),
                onPressed: () => setState(() {
                  _searching = !_searching;
                  if (!_searching) _search.clear();
                }),
              ),
              ShellActionSpec(
                id: 'apps-arrange',
                icon: Icons.tune_rounded,
                tooltip: context.l10n.appsCustomize,
                onPressed: () {
                  final tabs = context.read<AppTabCubit>();
                  final experiments = context.read<ExperimentalAppsCubit>();
                  unawaited(
                    showOrderEditorSheet(
                      context,
                      title: context.l10n.appsCustomize,
                      builder: (_) => MultiBlocProvider(
                        providers: [
                          BlocProvider.value(value: tabs),
                          BlocProvider.value(value: experiments),
                        ],
                        child: const AppsPickerEditor(),
                      ),
                    ),
                  );
                },
              ),
              ShellActionSpec(
                id: 'apps-view-list',
                segmentGroup: 'apps-view',
                icon: Icons.view_agenda_rounded,
                tooltip: context.l10n.appsHubListView,
                highlighted: !_showGrid,
                callbackToken: _showGrid,
                onPressed: () => setState(() => _showGrid = false),
              ),
              ShellActionSpec(
                id: 'apps-view-grid',
                segmentGroup: 'apps-view',
                icon: Icons.grid_view_rounded,
                tooltip: context.l10n.appsHubGridView,
                highlighted: _showGrid,
                callbackToken: _showGrid,
                onPressed: () => setState(() => _showGrid = true),
              ),
            ],
          ),
          Expanded(
            child: AppsHubPage(
              isActive: widget.isActive,
              query: _search.text,
              showGrid: _showGrid,
              replayToken: widget.replayToken,
            ),
          ),
        ],
      ),
    );
  }
}
