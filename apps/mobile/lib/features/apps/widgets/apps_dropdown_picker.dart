import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/features/apps/cubit/app_tab_cubit.dart';
import 'package:mobile/features/apps/cubit/app_tab_state.dart';
import 'package:mobile/features/apps/models/app_module.dart';
import 'package:mobile/features/apps/view/apps_hub_page.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

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
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () => unawaited(showAppsPicker(context)),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Image.asset(
                'assets/logos/transparent.png',
                width: 28,
                height: 28,
              ),
              const SizedBox(width: 10),
              Flexible(
                child: Text(
                  title ?? context.l10n.navApps,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(
                    context,
                  ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700),
                ),
              ),
              const SizedBox(width: 6),
              const Icon(Icons.keyboard_arrow_down_rounded, size: 20),
            ],
          ),
        ),
      ),
    ),
  );
}

final _openPickers = Expando<bool>();

/// Covers the shell, including its app bar and floating navigation.
Future<void> showAppsPicker(
  BuildContext context, {
  bool searchInitially = false,
}) async {
  final navigator = Navigator.of(context, rootNavigator: true);
  if (_openPickers[navigator] ?? false) return;
  _openPickers[navigator] = true;
  final tabs = context.read<AppTabCubit>();
  final router = GoRouter.of(context);
  try {
    final selected = await navigator.push<AppModule>(
      MaterialPageRoute(
        fullscreenDialog: true,
        builder: (_) => BlocProvider.value(
          value: tabs,
          child: _AppsPickerScreen(searchInitially: searchInitially),
        ),
      ),
    );
    if (selected != null && context.mounted) {
      unawaited(tabs.select(selected));
      router.go(selected.route);
    }
  } finally {
    _openPickers[navigator] = false;
  }
}

class _AppsPickerScreen extends StatefulWidget {
  const _AppsPickerScreen({required this.searchInitially});
  final bool searchInitially;
  @override
  State<_AppsPickerScreen> createState() => _AppsPickerScreenState();
}

class _AppsPickerScreenState extends State<_AppsPickerScreen> {
  final _search = TextEditingController();
  late bool _searching = widget.searchInitially;

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = shad.Theme.of(context).colorScheme;
    return Scaffold(
      key: const ValueKey('apps-picker-fullscreen'),
      backgroundColor: colors.background,
      appBar: AppBar(
        backgroundColor: colors.background,
        foregroundColor: colors.foreground,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        automaticallyImplyLeading: false,
        title: _searching
            ? TextField(
                controller: _search,
                autofocus: true,
                onChanged: (_) => setState(() {}),
                decoration: InputDecoration(
                  hintText: context.l10n.appsHubSearchHint,
                  border: InputBorder.none,
                  isDense: true,
                ),
              )
            : Row(
                children: [
                  Image.asset(
                    'assets/logos/transparent.png',
                    width: 28,
                    height: 28,
                  ),
                  const SizedBox(width: 10),
                  Text(
                    context.l10n.navApps,
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                ],
              ),
        actions: [
          IconButton(
            tooltip: _searching
                ? MaterialLocalizations.of(context).backButtonTooltip
                : context.l10n.appsHubSearchHint,
            onPressed: () => setState(() {
              _searching = !_searching;
              if (!_searching) _search.clear();
            }),
            icon: Icon(_searching ? Icons.arrow_back : Icons.search_rounded),
          ),
          IconButton(
            tooltip: MaterialLocalizations.of(context).closeButtonTooltip,
            onPressed: () => Navigator.of(context).pop(),
            icon: const Icon(Icons.close_rounded),
          ),
        ],
      ),
      body: SafeArea(
        top: false,
        child: Column(
          children: [
            Expanded(
              child: AppsHubPage(
                query: _search.text,
                onSelected: (module) => Navigator.of(context).pop(module),
              ),
            ),
            if (MediaQuery.viewInsetsOf(context).bottom == 0)
              BlocBuilder<AppTabCubit, AppTabState>(
                builder: (context, state) => SwitchListTile(
                  dense: true,
                  title: Text(context.l10n.appsShowBottomTab),
                  value: state.showAppsTab,
                  onChanged: (value) => unawaited(
                    context.read<AppTabCubit>().setShowAppsTab(value: value),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
