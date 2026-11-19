import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/core/utils/search_text.dart';
import 'package:mobile/features/apps/cubit/app_tab_cubit.dart';
import 'package:mobile/features/apps/cubit/app_tab_state.dart';
import 'package:mobile/features/apps/models/app_module.dart';
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
        borderRadius: BorderRadius.circular(AppTokens.of(context).shapes.field),
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

class _AppsScreenState extends State<AppsScreen>
    with SingleTickerProviderStateMixin {
  late final _entrance = AnimationController(
    vsync: this,
    duration: AppMotion.normal,
    value: 1,
  );
  late final Animation<double> _opacity = _entrance.drive(
    Tween<double>(begin: 0.9, end: 1),
  );
  final _search = TextEditingController();
  final _searchFocus = FocusNode(debugLabel: 'apps-search');
  String? _pendingSubmit;
  bool _launchQueued = false;

  @override
  void initState() {
    super.initState();
    _focusFromRequest();
  }

  void _focusFromRequest() {
    final tabs = context.read<AppTabCubit>();
    if (!widget.isActive || !tabs.state.shouldAutoFocus) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !widget.isActive || !tabs.state.shouldAutoFocus) return;
      tabs.consumeAutoFocus();
      _searchFocus.requestFocus();
    });
  }

  @override
  void didUpdateWidget(covariant AppsScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.isActive && !widget.isActive) {
      _pendingSubmit = null;
      _searchFocus.unfocus();
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted && !widget.isActive) _search.clear();
      });
    }
    if (!oldWidget.isActive && widget.isActive) _focusFromRequest();
    if (widget.isActive &&
        oldWidget.replayToken != widget.replayToken &&
        !MediaQuery.disableAnimationsOf(context)) {
      unawaited(_entrance.forward(from: 0));
    }
  }

  @override
  void dispose() {
    _entrance.dispose();
    _search.dispose();
    _searchFocus.dispose();
    super.dispose();
  }

  void _submitSearch(String submitted) {
    if (!widget.isActive || _pendingSubmit != null || _launchQueued) {
      return;
    }
    final query = foldSearchText(_search.text);
    if (foldSearchText(submitted) != query) return;
    if (query.isEmpty) {
      _search.clear();
      _searchFocus.unfocus();
      return;
    }
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
          foldSearchText(_search.text) != query ||
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
      _open(module);
    });
  }

  void _open(AppModule module) {
    _resetSearch();
    unawaited(context.read<AppTabCubit>().select(module));
    context.go(module.route);
  }

  void _resetSearch() {
    _pendingSubmit = null;
    _search.clear();
    _searchFocus.unfocus();
  }

  void _manage() {
    final tabs = context.read<AppTabCubit>();
    final experiments = context.read<ExperimentalAppsCubit?>();
    _searchFocus.unfocus();
    unawaited(
      showOrderEditorSheet(
        context,
        title: context.l10n.appsCustomize,
        builder: (_) => MultiBlocProvider(
          providers: [
            BlocProvider.value(value: tabs),
            if (experiments != null) BlocProvider.value(value: experiments),
          ],
          child: const AppsPickerEditor(),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    _scheduleSearchSelection(context);
    return BlocListener<AppTabCubit, AppTabState>(
      listenWhen: (previous, current) =>
          !previous.shouldAutoFocus && current.shouldAutoFocus,
      listener: (_, _) => _focusFromRequest(),
      child: Column(
        key: const ValueKey('apps-screen'),
        children: [
          ShellChromeActions(
            ownerId: 'apps-screen',
            locations: const {Routes.apps},
            onResetSection: _resetSearch,
            actions: [
              ShellActionSpec(
                id: 'apps-arrange',
                icon: LucideIcons.pencil,
                tooltip: context.l10n.appsCustomize,
                onPressed: _manage,
              ),
            ],
          ),
          Expanded(
            child: FadeTransition(
              opacity: _opacity,
              child: ValueListenableBuilder<TextEditingValue>(
                valueListenable: _search,
                builder: (context, value, _) => AppsHubPage(
                  query: value.text,
                  onSelected: _open,
                  onManage: _manage,
                  search: AppSearchField(
                    key: const ValueKey('apps-search-field'),
                    controller: _search,
                    focusNode: _searchFocus,
                    placeholder: context.l10n.appsHubSearchHint,
                    clearTooltip: context.l10n.commonClearSearch,
                    onSubmitted: _submitSearch,
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
