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
        EditableTextTapOutsideIntent:
            CallbackAction<EditableTextTapOutsideIntent>(
              onInvoke: (intent) {
                if (!KeyboardDismissGuard.isSuspended &&
                    (MediaQuery.viewInsetsOf(context).bottom > 0 ||
                        View.of(context).viewInsets.bottom > 0)) {
                  intent.focusNode.unfocus();
                }
                return null;
              },
            ),
      },
      child: child,
    );
  }
}
