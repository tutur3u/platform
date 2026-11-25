import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile/core/input/desktop_shortcut_platform.dart';
import 'package:mobile/features/shell/view/shell_page.dart';
import 'package:mobile/l10n/l10n.dart';

enum PaletteShortcut {
  palette(LogicalKeyboardKey.keyK, 'K'),
  home(LogicalKeyboardKey.digit1, '1', ShellRootTab.home),
  apps(LogicalKeyboardKey.digit2, '2', ShellRootTab.apps),
  mira(LogicalKeyboardKey.digit3, '3', ShellRootTab.assistant),
  notifications(LogicalKeyboardKey.digit4, '4', ShellRootTab.notifications),
  profile(LogicalKeyboardKey.digit5, '5', ShellRootTab.profile),
  settings(LogicalKeyboardKey.comma, ','),
  help(LogicalKeyboardKey.slash, '/'),
  newItem(LogicalKeyboardKey.keyN, 'N');

  const PaletteShortcut(this.key, this.keyLabel, [this.tab]);

  final LogicalKeyboardKey key;
  final String keyLabel;
  final ShellRootTab? tab;

  /// Whether the shortcut replaces the routed page, so a page holding unsaved
  /// work must not receive it.
  bool get leavesCurrentPage =>
      tab != null || this == settings || this == newItem;

  SingleActivator activator(TargetPlatform platform) => SingleActivator(
    key,
    meta: platform == TargetPlatform.macOS,
    control: platform != TargetPlatform.macOS,
    includeRepeats: false,
  );

  String hint(TargetPlatform platform, AppLocalizations l10n) =>
      platform == TargetPlatform.macOS
      ? '⌘$keyLabel'
      : '${l10n.commandPaletteControl}+$keyLabel';

  String label(AppLocalizations l10n) => switch (this) {
    palette => l10n.commandPaletteTitle,
    home => l10n.navHome,
    apps => l10n.navApps,
    mira => l10n.navMira,
    notifications => l10n.notificationsTitle,
    profile => l10n.profileTitle,
    settings => l10n.settingsTitle,
    help => l10n.commandPaletteShortcuts,
    newItem => l10n.commandPaletteNewItem,
  };
}

class _PaletteShortcutIntent extends Intent {
  const _PaletteShortcutIntent(this.shortcut);

  final PaletteShortcut shortcut;
}

/// The routed app only binds modifier chords, and only on desktop platforms.
/// Unmodified navigation keys are scoped to the open palette.
///
/// While a text field has focus the chords belong to text editing and the input
/// method, unless [allowWhileEditing] reports an open overlay that still needs
/// its own toggle chord from its search field.
class PaletteShortcuts extends StatelessWidget {
  const PaletteShortcuts({
    required this.onShortcut,
    required this.child,
    this.allowWhileEditing,
    super.key,
  });

  final ValueChanged<PaletteShortcut> onShortcut;
  final bool Function()? allowWhileEditing;
  final Widget child;

  @override
  Widget build(BuildContext context) => Shortcuts(
    shortcuts: {
      if (supportsDesktopShortcuts())
        for (final shortcut in PaletteShortcut.values)
          shortcut.activator(defaultTargetPlatform): _PaletteShortcutIntent(
            shortcut,
          ),
    },
    child: Actions(
      actions: {
        _PaletteShortcutIntent: _PaletteShortcutAction(
          onShortcut,
          allowWhileEditing,
        ),
      },
      child: child,
    ),
  );
}

class _PaletteShortcutAction extends Action<_PaletteShortcutIntent> {
  _PaletteShortcutAction(this._onShortcut, this._allowWhileEditing);

  final ValueChanged<PaletteShortcut> _onShortcut;
  final bool Function()? _allowWhileEditing;

  @override
  bool isEnabled(_PaletteShortcutIntent intent) =>
      !isTextEditingFocused() || (_allowWhileEditing?.call() ?? false);

  @override
  Object? invoke(_PaletteShortcutIntent intent) {
    _onShortcut(intent.shortcut);
    return null;
  }
}
