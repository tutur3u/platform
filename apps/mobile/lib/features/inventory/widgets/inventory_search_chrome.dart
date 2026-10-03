import 'package:flutter/material.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';
import 'package:mobile/l10n/l10n.dart';

/// Inventory declares actions; the shared shell owns search and keyboard
/// policy.
class InventorySearchChrome extends StatefulWidget {
  const InventorySearchChrome({
    required this.location,
    required this.controller,
    required this.onChanged,
    this.hint,
    this.actions = const [],
    super.key,
  });

  final String location;
  final TextEditingController controller;
  final ValueChanged<String> onChanged;
  final String? hint;
  final List<ShellActionSpec> actions;

  @override
  State<InventorySearchChrome> createState() => _InventorySearchChromeState();
}

class _InventorySearchChromeState extends State<InventorySearchChrome> {
  bool _open = false;

  void _close() {
    widget.controller.clear();
    widget.onChanged('');
    setState(() => _open = false);
  }

  @override
  Widget build(BuildContext context) => ShellChromeActions(
    ownerId: 'inventory-search-${widget.location}',
    locations: {widget.location},
    actions: [
      ShellActionSpec(
        id: '${widget.location}-search',
        icon: _open ? Icons.close : Icons.search,
        tooltip: _open
            ? context.l10n.commonCancel
            : widget.hint ?? context.l10n.inventoryRedesignLoadedSearch,
        searchController: _open ? widget.controller : null,
        searchHint: widget.hint ?? context.l10n.inventoryRedesignLoadedSearch,
        onSearchChanged: widget.onChanged,
        onSearchSubmitted: widget.onChanged,
        onCloseSearch: _close,
        onPressed: () {
          if (_open) {
            _close();
          } else {
            setState(() => _open = true);
          }
        },
      ),
      ...widget.actions,
    ],
  );
}
