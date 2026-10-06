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
    // EditableText groups its field, selection handles and toolbar into a
    // TextFieldTapRegion. Honor that group instead of the focused render box:
    // toolbar pointer-down must not dispose the overlay before its tap fires.
    // Dialogs may consume the inherited inset; the view still reports the
    // visible system keyboard. This is a predicate, not additional padding.
    return Actions(
      actions: <Type, Action<Intent>>{
        EditableTextTapOutsideIntent: _KeyboardDismissTapOutsideAction(context),
      },
      child: child,
    );
  }
}

class _KeyboardDismissTapOutsideAction
    extends ContextAction<EditableTextTapOutsideIntent> {
  _KeyboardDismissTapOutsideAction(this.keyboardContext);

  final BuildContext keyboardContext;

  @override
  Object? invoke(EditableTextTapOutsideIntent intent, [BuildContext? context]) {
    if (KeyboardDismissGuard.isSuspended) {
      return null;
    }
    if (MediaQuery.viewInsetsOf(keyboardContext).bottom > 0 ||
        View.of(keyboardContext).viewInsets.bottom > 0) {
      intent.focusNode.unfocus();
      return null;
    }

    // Preserve Flutter's pointer/platform policy when the IME is absent.
    // The overridable EditableText action supplies its native callingAction.
    final nativeAction = callingAction;
    if (nativeAction is ContextAction<EditableTextTapOutsideIntent>) {
      return nativeAction.invoke(intent, context ?? keyboardContext);
    }
    return nativeAction?.invoke(intent);
  }
}
