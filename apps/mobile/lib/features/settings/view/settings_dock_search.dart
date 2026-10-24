import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';

/// Search as the route's primary floating dock action. The shell owns the
/// field while [active]; isolated previews without the shell chrome registry
/// render [fallback] inline instead.
class SettingsDockSearch extends StatelessWidget {
  const SettingsDockSearch({
    required this.ownerId,
    required this.location,
    required this.controller,
    required this.hint,
    required this.active,
    required this.onActiveChanged,
    required this.onChanged,
    required this.fallback,
    super.key,
  });

  final String ownerId;
  final String location;
  final TextEditingController controller;
  final String hint;
  final bool active;
  final ValueChanged<bool> onActiveChanged;
  final ValueChanged<String> onChanged;
  final Widget fallback;

  void _close() {
    controller.clear();
    onChanged('');
    onActiveChanged(false);
  }

  @override
  Widget build(BuildContext context) {
    if (context.read<ShellChromeActionsCubit?>() == null) return fallback;
    return ShellChromeActions(
      ownerId: ownerId,
      locations: {location},
      actions: [
        ShellActionSpec(
          id: '$location/search',
          icon: active ? AppIcons.close : AppIcons.search,
          tooltip: hint,
          inDock: true,
          highlighted: active || controller.text.isNotEmpty,
          callbackToken: (active, controller.text),
          searchController: active ? controller : null,
          searchHint: hint,
          onSearchChanged: onChanged,
          onCloseSearch: _close,
          onPressed: () => active ? _close() : onActiveChanged(true),
        ),
      ],
    );
  }
}
