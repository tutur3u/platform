import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/responsive/responsive_padding.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/apps/cubit/app_tab_cubit.dart';
import 'package:mobile/features/apps/cubit/app_tab_state.dart';
import 'package:mobile/features/apps/view/apps_hub_page.dart';
import 'package:mobile/features/apps/widgets/apps_picker_editor.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';
import 'package:mobile/l10n/l10n.dart';

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
  const AppsScreen({this.replayToken = 0, super.key});
  final int replayToken;

  @override
  State<AppsScreen> createState() => _AppsScreenState();
}

class _AppsScreenState extends State<AppsScreen> {
  final _search = TextEditingController();
  bool _searching = false;
  bool _editing = false;

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

  @override
  Widget build(BuildContext context) => BlocListener<AppTabCubit, AppTabState>(
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
              icon: _searching
                  ? Icons.search_off_rounded
                  : Icons.search_rounded,
              tooltip: context.l10n.appsHubSearchHint,
              callbackToken: 'search-$_searching',
              onPressed: () => setState(() {
                _searching = !_searching;
                if (!_searching) _search.clear();
              }),
            ),
            ShellActionSpec(
              id: 'apps-arrange',
              icon: _editing ? Icons.check_rounded : Icons.tune_rounded,
              tooltip: context.l10n.appsCustomize,
              callbackToken: 'arrange-$_editing',
              onPressed: () => setState(() => _editing = !_editing),
            ),
          ],
        ),
        if (_searching)
          Padding(
            padding: EdgeInsets.symmetric(
              horizontal: ResponsivePadding.horizontal(context.deviceClass),
              vertical: 8,
            ),
            child: TextField(
              controller: _search,
              autofocus: true,
              onChanged: (_) => setState(() {}),
              decoration: InputDecoration(
                hintText: context.l10n.appsHubSearchHint,
                prefixIcon: const Icon(Icons.search_rounded),
                isDense: true,
              ),
            ),
          ),
        Expanded(
          child: _editing
              ? const AppsPickerEditor()
              : AppsHubPage(
                  query: _search.text,
                  replayToken: widget.replayToken,
                ),
        ),
      ],
    ),
  );
}
