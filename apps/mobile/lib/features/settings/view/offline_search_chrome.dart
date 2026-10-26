import 'package:flutter/material.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/settings/view/settings_dock_search.dart';

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

  @override
  Widget build(BuildContext context) => SettingsDockSearch(
    ownerId: 'offline-search-${widget.moduleId}',
    location: Routes.settingsOfflineModulePath(widget.moduleId),
    controller: widget.controller,
    hint: widget.hint,
    active: _active,
    onActiveChanged: (active) => setState(() => _active = active),
    onChanged: widget.onChanged,
    fallback: AppSearchField(
      key: const ValueKey('offline-namespace-search'),
      controller: widget.controller,
      placeholder: widget.hint,
      onChanged: widget.onChanged,
    ),
  );
}
