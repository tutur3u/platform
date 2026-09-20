import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/features/apps/cubit/app_tab_cubit.dart';
import 'package:mobile/features/apps/cubit/app_tab_state.dart';
import 'package:mobile/features/apps/models/app_module.dart';
import 'package:mobile/features/apps/view/apps_hub_page.dart';
import 'package:mobile/l10n/l10n.dart';

/// The whole brand/name control opens the same Apps surface as the Apps page.
class AppsDropdownPicker extends StatelessWidget {
  const AppsDropdownPicker({this.title, super.key});
  final String? title;

  Future<void> _open(BuildContext context) async {
    final router = GoRouter.of(context);
    final tabs = context.read<AppTabCubit>();
    await Navigator.of(context).push<void>(
      MaterialPageRoute(
        fullscreenDialog: true,
        builder: (dialogContext) => BlocProvider.value(
          value: tabs,
          child: _AppsPickerScreen(
            onSelected: (module) {
              Navigator.of(dialogContext).pop();
              unawaited(tabs.select(module));
              router.go(module.route);
            },
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) => Semantics(
    button: true,
    label:
        '${title ?? context.l10n.navApps}, ${context.l10n.appsHubSearchHint}',
    child: Tooltip(
      message: context.l10n.navApps,
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () => unawaited(_open(context)),
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

class _AppsPickerScreen extends StatefulWidget {
  const _AppsPickerScreen({required this.onSelected});
  final ValueChanged<AppModule> onSelected;
  @override
  State<_AppsPickerScreen> createState() => _AppsPickerScreenState();
}

class _AppsPickerScreenState extends State<_AppsPickerScreen> {
  String _query = '';
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      automaticallyImplyLeading: false,
      title: Row(
        children: [
          Image.asset('assets/logos/transparent.png', width: 28, height: 28),
          const SizedBox(width: 12),
          Text(context.l10n.navApps),
        ],
      ),
      actions: [
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
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 16),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 760),
              child: TextField(
                onChanged: (value) => setState(() => _query = value),
                decoration: InputDecoration(
                  hintText: context.l10n.appsHubSearchHint,
                  prefixIcon: const Icon(Icons.search_rounded),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(16),
                  ),
                ),
              ),
            ),
          ),
          Expanded(
            child: AppsHubPage(query: _query, onSelected: widget.onSelected),
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
