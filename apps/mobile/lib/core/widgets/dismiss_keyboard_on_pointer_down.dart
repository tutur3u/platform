import 'package:flutter/widgets.dart';

final class KeyboardDismissGuard {
  static int _suspendDepth = 0;

  static bool get isSuspended => _suspendDepth > 0;

  static void suspend() {
    _suspendDepth += 1;
  }

  static void resume() {
    if (_suspendDepth <= 0) {
      _suspendDepth = 0;
      return;
    }
    _suspendDepth -= 1;
  }
}

class DismissKeyboardOnPointerDown extends StatelessWidget {
  const DismissKeyboardOnPointerDown({required this.child, super.key});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Listener(
      behavior: HitTestBehavior.translucent,
      onPointerDown: (event) {
        if (KeyboardDismissGuard.isSuspended) {
          return;
        }

        if (MediaQuery.viewInsetsOf(context).bottom <= 0) {
          return;
        }

        final primaryFocus = FocusManager.instance.primaryFocus;
        final focusedContext = primaryFocus?.context;
        if (primaryFocus == null || focusedContext == null) {
          return;
        }

        final focusedRenderObject = focusedContext.findRenderObject();
        final focusedRenderBox = _resolveAttachedRenderBox(focusedRenderObject);
        if (focusedRenderBox == null) {
          return;
        }

        final localPosition = focusedRenderBox.globalToLocal(event.position);
        if (focusedRenderBox.size.contains(localPosition)) {
          return;
        }

        primaryFocus.unfocus();
      },
      child: child,
    );
  }

  RenderBox? _resolveAttachedRenderBox(RenderObject? renderObject) {
    var current = renderObject;
    while (current != null) {
      if (current is RenderBox && current.attached && current.hasSize) {
        return current;
      }
      current = current.parent;
    }
    return null;
  }
}
