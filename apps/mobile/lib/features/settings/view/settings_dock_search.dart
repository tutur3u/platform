import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';

/// Search as the route's primary floating dock action. The shell owns the
/// field while [active]; isolated previews without the shell chrome registry
/// render [fallback] inline instead. [actions] are the route's other shell
/// actions, such as an add action in the top bar.
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
    this.actions = const [],
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
  final List<ShellActionSpec> actions;

  void _close() {
    FocusManager.instance.primaryFocus?.unfocus();
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
      onBack: active || controller.text.isNotEmpty
          ? () async => _close()
          : null,
      actions: [
        ShellActionSpec.search(
          id: '$location/search',
          active: active,
          keepVisibleWithKeyboard: false,
          hasQuery: controller.text.isNotEmpty,
          callbackToken: controller.text,
          tooltip: hint,
          controller: controller,
          searchHint: hint,
          onSearchChanged: onChanged,
          onCloseSearch: _close,
          onPressed: () => active ? _close() : onActiveChanged(true),
        ),
        ...actions,
      ],
    );
  }
}
