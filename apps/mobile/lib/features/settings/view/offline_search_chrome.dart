import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';

/// The shell owns the route's search field; isolated previews have a fallback.
class OfflineSearchChrome extends StatefulWidget {
  const OfflineSearchChrome({
    required this.moduleId,
    required this.controller,
    required this.hint,
    required this.onChanged,
    super.key,
  });
  final String moduleId;
  final TextEditingController controller;
  final String hint;
  final ValueChanged<String> onChanged;

  @override
  State<OfflineSearchChrome> createState() => _OfflineSearchChromeState();
}

class _OfflineSearchChromeState extends State<OfflineSearchChrome> {
  bool _active = false;

  void _close() {
    widget.controller.clear();
    widget.onChanged('');
    setState(() => _active = false);
  }

  @override
  Widget build(BuildContext context) {
    if (context.read<ShellChromeActionsCubit?>() == null) {
      return AppSearchField(
        key: const ValueKey('offline-namespace-search'),
        controller: widget.controller,
        placeholder: widget.hint,
        onChanged: widget.onChanged,
      );
    }
    final location = Routes.settingsOfflineModulePath(widget.moduleId);
    return ShellChromeActions(
      ownerId: 'offline-search-${widget.moduleId}',
      locations: {location},
      actions: [
        ShellActionSpec(
          id: '$location/search',
          icon: _active ? AppIcons.close : AppIcons.search,
          tooltip: widget.hint,
          inDock: true,
          highlighted: _active || widget.controller.text.isNotEmpty,
          callbackToken: (_active, widget.controller.text),
          searchController: _active ? widget.controller : null,
          searchHint: widget.hint,
          onSearchChanged: widget.onChanged,
          onCloseSearch: _close,
          onPressed: () {
            if (_active) {
              _close();
            } else {
              setState(() => _active = true);
            }
          },
        ),
      ],
    );
  }
}
