import 'package:flutter/material.dart';
import 'package:mobile/features/assistant/cubit/assistant_shell_cubit.dart';
import 'package:mobile/l10n/l10n.dart';

class AssistantSettingsSheetBody extends StatelessWidget {
  const AssistantSettingsSheetBody({
    required this.shellState,
    required this.onImmersiveChanged,
    super.key,
  });

  final AssistantShellState shellState;
  final Future<void> Function({required bool value}) onImmersiveChanged;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Material(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(24),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 18, 16, 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                context.l10n.assistantSettingsTitle,
                style: Theme.of(
                  context,
                ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 16),
              SwitchListTile.adaptive(
                value: shellState.isImmersive,
                title: Text(context.l10n.assistantImmersiveLabel),
                subtitle: Text(
                  shellState.isImmersive
                      ? context.l10n.assistantHideBottomNavLabel
                      : context.l10n.assistantShowBottomNavLabel,
                ),
                contentPadding: EdgeInsets.zero,
                onChanged: (value) => onImmersiveChanged(value: value),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
