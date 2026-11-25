import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:mobile/core/input/desktop_shortcut_platform.dart';
import 'package:mobile/features/shell/cubit/sidebar_behavior.dart';

class ShellSidebarShortcuts extends StatelessWidget {
  const ShellSidebarShortcuts({
    required this.child,
    required this.focusNode,
    required this.behavior,
    required this.onSelected,
    super.key,
  });

  final Widget child;
  final FocusNode focusNode;
  final SidebarBehavior behavior;
  final ValueChanged<SidebarBehavior>? onSelected;

  @override
  Widget build(BuildContext context) {
    final mac = defaultTargetPlatform == TargetPlatform.macOS;
    return Shortcuts(
      shortcuts: {
        if (onSelected != null && supportsDesktopShortcuts()) ...{
          SingleActivator(
            LogicalKeyboardKey.keyB,
            meta: mac,
            control: !mac,
            includeRepeats: false,
          ): const _SidebarBehaviorIntent(),
          SingleActivator(
            LogicalKeyboardKey.keyB,
            meta: mac,
            control: !mac,
            alt: true,
            includeRepeats: false,
          ): const _SidebarBehaviorIntent(
            minimal: true,
          ),
        },
      },
      child: Actions(
        actions: {
          _SidebarBehaviorIntent: _SidebarBehaviorAction((intent) {
            onSelected?.call(
              intent.minimal ? SidebarBehavior.minimal : behavior.toggled,
            );
            return null;
          }),
        },
        child: Focus(
          focusNode: focusNode,
          autofocus: onSelected != null,
          skipTraversal: true,
          child: child,
        ),
      ),
    );
  }
}

class _SidebarBehaviorIntent extends Intent {
  const _SidebarBehaviorIntent({this.minimal = false});

  final bool minimal;
}

class _SidebarBehaviorAction extends CallbackAction<_SidebarBehaviorIntent> {
  _SidebarBehaviorAction(Object? Function(_SidebarBehaviorIntent) callback)
    : super(onInvoke: callback);

  @override
  bool isEnabled(_SidebarBehaviorIntent intent) =>
      !isTextEditingFocused() && !(intent.minimal && _isWindowsAltGr());

  /// Windows reports AltGr as Control plus the right Alt key, so the Ctrl+Alt
  /// binding would otherwise fire for layouts that type characters with AltGr.
  static bool _isWindowsAltGr() =>
      defaultTargetPlatform == TargetPlatform.windows &&
      HardwareKeyboard.instance.logicalKeysPressed.contains(
        LogicalKeyboardKey.altRight,
      );
}
