import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:mobile/features/mail/view/mail_swipe_preferences.dart';

/// Horizontal gestures preserve scrolling and long-press selection.
/// The optimistic list state owns row removal.
class MailSwipeTile extends StatelessWidget {
  const MailSwipeTile({
    required this.id,
    required this.preferences,
    required this.onAction,
    required this.child,
    this.enabled = true,
    super.key,
  });
  final String id;
  final MailSwipePreferences preferences;
  final Future<void> Function(MailSwipeAction) onAction;
  final Widget child;
  final bool enabled;

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: preferences,
    builder: (context, _) {
      final left = preferences.left;
      final right = preferences.right;
      Widget background(MailSwipeAction action, Alignment alignment) {
        final colors = Theme.of(context).colorScheme;
        final destructive = action == MailSwipeAction.trash;
        return Container(
          color: destructive ? colors.errorContainer : colors.primaryContainer,
          alignment: alignment,
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                action.icon,
                color: destructive
                    ? colors.onErrorContainer
                    : colors.onPrimaryContainer,
              ),
              Text(
                action.label(context),
                style: TextStyle(
                  color: destructive
                      ? colors.onErrorContainer
                      : colors.onPrimaryContainer,
                ),
              ),
            ],
          ),
        );
      }

      final rtl = Directionality.of(context) == TextDirection.rtl;
      final start = rtl ? left : right;
      final end = rtl ? right : left;
      return Semantics(
        customSemanticsActions: {
          for (final action in {left, right})
            if (enabled && action != MailSwipeAction.none)
              CustomSemanticsAction(label: action.label(context)): () =>
                  onAction(action),
        },
        child: Dismissible(
          key: ValueKey('mail-swipe-$id'),
          direction:
              !enabled ||
                  (start == MailSwipeAction.none && end == MailSwipeAction.none)
              ? DismissDirection.none
              : start == MailSwipeAction.none
              ? DismissDirection.endToStart
              : end == MailSwipeAction.none
              ? DismissDirection.startToEnd
              : DismissDirection.horizontal,
          background: background(start, Alignment.centerLeft),
          secondaryBackground: background(end, Alignment.centerRight),
          confirmDismiss: (direction) async {
            await onAction(
              direction == DismissDirection.startToEnd ? start : end,
            );
            return false;
          },
          child: child,
        ),
      );
    },
  );
}
