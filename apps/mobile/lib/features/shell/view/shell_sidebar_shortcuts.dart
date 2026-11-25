import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:mobile/features/shell/cubit/sidebar_behavior.dart';

class ShellSidebarShortcuts extends StatelessWidget {
  const ShellSidebarShortcuts({
    required this.child,
    required this.focusNode,
    required this.behavior,
    required this.onSelected,
    required this.onDismiss,
    super.key,
  });

  final Widget child;
  final FocusNode focusNode;
  final SidebarBehavior behavior;
  final ValueChanged<SidebarBehavior>? onSelected;
  final VoidCallback? onDismiss;

  @override
  Widget build(BuildContext context) => Shortcuts(
    shortcuts: {
      if (onSelected != null) ...const {
        SingleActivator(
          LogicalKeyboardKey.keyB,
          control: true,
          includeRepeats: false,
        ): _SidebarBehaviorIntent(),
        SingleActivator(
          LogicalKeyboardKey.keyB,
          meta: true,
          includeRepeats: false,
        ): _SidebarBehaviorIntent(),
        SingleActivator(
          LogicalKeyboardKey.keyB,
          control: true,
          alt: true,
          includeRepeats: false,
        ): _SidebarBehaviorIntent(
          minimal: true,
        ),
        SingleActivator(
          LogicalKeyboardKey.keyB,
          meta: true,
          alt: true,
          includeRepeats: false,
        ): _SidebarBehaviorIntent(
          minimal: true,
        ),
      },
      if (onDismiss != null)
        const SingleActivator(LogicalKeyboardKey.escape):
            const _DismissSidebarIntent(),
    },
    child: Actions(
      actions: {
        _SidebarBehaviorIntent: _SidebarBehaviorAction((intent) {
          onSelected?.call(
            intent.minimal ? SidebarBehavior.minimal : behavior.toggled,
          );
          return null;
        }),
        _DismissSidebarIntent: CallbackAction<_DismissSidebarIntent>(
          onInvoke: (_) {
            onDismiss?.call();
            return null;
          },
        ),
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

class _SidebarBehaviorIntent extends Intent {
  const _SidebarBehaviorIntent({this.minimal = false});

  final bool minimal;
}

class _DismissSidebarIntent extends Intent {
  const _DismissSidebarIntent();
}

class _SidebarBehaviorAction extends CallbackAction<_SidebarBehaviorIntent> {
  _SidebarBehaviorAction(Object? Function(_SidebarBehaviorIntent) callback)
    : super(onInvoke: callback);

  @override
  bool isEnabled(_SidebarBehaviorIntent intent) {
    final context = FocusManager.instance.primaryFocus?.context;
    return context == null ||
        (context.widget is! EditableText &&
            context.findAncestorWidgetOfExactType<EditableText>() == null);
  }
}
