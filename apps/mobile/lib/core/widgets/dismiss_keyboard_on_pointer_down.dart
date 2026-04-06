import 'package:flutter/widgets.dart';

class DismissKeyboardOnPointerDown extends StatelessWidget {
  const DismissKeyboardOnPointerDown({required this.child, super.key});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Listener(
      behavior: HitTestBehavior.translucent,
      onPointerDown: (event) {
        if (MediaQuery.viewInsetsOf(context).bottom <= 0) {
          return;
        }

        final primaryFocus = FocusManager.instance.primaryFocus;
        final focusedContext = primaryFocus?.context;
        if (primaryFocus == null || focusedContext == null) {
          return;
        }

        final focusedRenderObject = focusedContext.findRenderObject();
        if (focusedRenderObject is RenderBox &&
            focusedRenderObject.attached &&
            focusedRenderObject.hasSize) {
          final localPosition = focusedRenderObject.globalToLocal(
            event.position,
          );
          if (focusedRenderObject.size.contains(localPosition)) {
            return;
          }
        }

        primaryFocus.unfocus();
      },
      child: child,
    );
  }
}
