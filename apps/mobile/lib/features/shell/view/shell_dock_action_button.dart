import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/interaction/app_haptics.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';

/// The same floating action pill used beside the normal shell navigation.
class ShellDockActionButton extends StatelessWidget {
  const ShellDockActionButton({
    required this.action,
    this.primary = true,
    super.key,
  });
  final ShellActionSpec action;
  final bool primary;

  @override
  Widget build(BuildContext context) => Tooltip(
    message: action.tooltip ?? '',
    excludeFromSemantics: true,
    child: ConstrainedBox(
      constraints: BoxConstraints(
        maxWidth: (MediaQuery.sizeOf(context).width * .35).clamp(48, 240),
      ),
      child: FilledButton(
        style: FilledButton.styleFrom(
          backgroundColor: primary
              ? Theme.of(context).colorScheme.onSurface
              : Theme.of(context).colorScheme.surfaceContainerHigh,
          foregroundColor: primary
              ? Theme.of(context).colorScheme.surface
              : Theme.of(context).colorScheme.onSurface,
          minimumSize: const Size(48, 48),
          padding: EdgeInsets.symmetric(
            horizontal: MediaQuery.sizeOf(context).shortestSide >= 600
                ? 16
                : 12,
          ),
          shape: const StadiumBorder(),
        ),
        onPressed: action.enabled && !action.isLoading
            ? () {
                unawaited(AppHaptics.selection());
                action.onPressed?.call();
              }
            : null,
        child: Semantics(
          label: action.tooltip,
          excludeSemantics: true,
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (action.isLoading)
                const NovaLoadingIndicator(size: 24)
              else
                AnimatedSwitcher(
                  duration: const Duration(milliseconds: 220),
                  child: Icon(
                    action.icon,
                    key: ValueKey((action.id, action.icon)),
                    size: 24,
                  ),
                ),
              if (MediaQuery.sizeOf(context).shortestSide >= 600) ...[
                const SizedBox(width: 8),
                Flexible(
                  child: Text(
                    action.tooltip ?? '',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    ),
  );
}
