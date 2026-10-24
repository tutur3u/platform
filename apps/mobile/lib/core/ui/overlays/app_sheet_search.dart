import 'package:flutter/material.dart';
import 'package:mobile/core/ui/components/app_search_field.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/core/ui/overlays/app_modal_scope.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';

/// Search configuration for an `AppSheetScaffold`.
@immutable
class AppSheetSearch {
  const AppSheetSearch({
    required this.controller,
    required this.hint,
    required this.onChanged,
    this.startActive = false,
  });

  /// Owned by the sheet; its text is the current query.
  final TextEditingController controller;
  final String hint;
  final ValueChanged<String> onChanged;

  /// Opens the shell search field (and keyboard) as the sheet appears.
  final bool startActive;
}

/// Registers a sheet's search as a dynamic action in the shell chrome.
///
/// Inside the shell the floating dock shows a search action; tapping it turns
/// the top navbar into the shell search field bound to [search]'s controller.
/// The registration is modal (see `ShellChromeActionsState.topmostModalOwner`)
/// so the page's own actions are hidden while the sheet is open, and it is
/// removed with the sheet. When the shell chrome does not visibly host the
/// sheet (no shell, or a root-navigator sheet covering the navbar), an inline
/// [AppSearchField] is rendered instead.
class AppSheetSearchHost extends StatefulWidget {
  const AppSheetSearchHost({required this.search, super.key});

  final AppSheetSearch search;

  @override
  State<AppSheetSearchHost> createState() => _AppSheetSearchHostState();
}

class _AppSheetSearchHostState extends State<AppSheetSearchHost> {
  late bool _active = widget.search.startActive;
  AppModalScope? _scope;

  String get _registrationId => '${_scope!.ownerId}/search';

  /// The registry only when the shell chrome visibly hosts this sheet; a
  /// root-navigator sheet covers the navbar and uses the inline field.
  static ShellChromeActionsCubit? _chromeOf(AppModalScope? scope) =>
      scope != null && scope.shellChromeVisible ? scope.chrome : null;

  ShellChromeActionsCubit? get _chrome => _chromeOf(_scope);

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final next = AppModalScope.maybeOf(context);
    if (next?.ownerId != _scope?.ownerId || _chromeOf(next) != _chrome) {
      _chrome?.unregister(_registrationId);
    }
    _scope = next;
    _sync();
  }

  @override
  void didUpdateWidget(covariant AppSheetSearchHost oldWidget) {
    super.didUpdateWidget(oldWidget);
    _sync();
  }

  @override
  void dispose() {
    final chrome = _chrome;
    if (chrome != null && !chrome.isClosed) chrome.unregister(_registrationId);
    super.dispose();
  }

  void _toggle() {
    if (_active) {
      _close();
    } else {
      setState(() => _active = true);
      _sync();
    }
  }

  void _close() {
    final search = widget.search;
    if (search.controller.text.isNotEmpty) {
      search.controller.clear();
      search.onChanged('');
    }
    if (!mounted) return;
    setState(() => _active = false);
    _sync();
  }

  void _sync() {
    final scope = _scope;
    final chrome = _chrome;
    if (scope == null || chrome == null || chrome.isClosed) return;
    final search = widget.search;
    final hasQuery = search.controller.text.isNotEmpty;
    chrome.register(
      registrationId: _registrationId,
      ownerId: scope.ownerId,
      locations: const {},
      modal: true,
      actions: [
        ShellActionSpec(
          id: '${scope.ownerId}/search',
          icon: _active ? AppIcons.close : AppIcons.search,
          tooltip: search.hint,
          inDock: true,
          highlighted: _active || hasQuery,
          callbackToken: (_active, hasQuery),
          searchController: _active ? search.controller : null,
          searchHint: search.hint,
          onSearchChanged: search.onChanged,
          onCloseSearch: _close,
          onPressed: _toggle,
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_chrome != null) return const SizedBox.shrink();
    final search = widget.search;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
      child: AppSearchField(
        controller: search.controller,
        placeholder: search.hint,
        onChanged: search.onChanged,
        autofocus: search.startActive,
      ),
    );
  }
}
