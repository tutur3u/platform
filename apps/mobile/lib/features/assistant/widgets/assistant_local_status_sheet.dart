import 'package:flutter/material.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class AssistantLocalStatusSheet extends StatelessWidget {
  const AssistantLocalStatusSheet({
    required this.preparing,
    required this.onManage,
    this.modelLabel,
    this.notice,
    super.key,
  });
  final String? modelLabel;
  final String? notice;
  final bool preparing;
  final VoidCallback onManage;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.all(20),
    child: SingleChildScrollView(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            context.l10n.assistantLocalModeAction,
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: 12),
          Text(
            preparing
                ? context.l10n.assistantLocalLoading
                : context.l10n.assistantLocalMode(
                    modelLabel ?? context.l10n.assistantLocalSelectionUnknown,
                  ),
          ),
          if (notice case final text?) ...[
            const SizedBox(height: 12),
            Text(text),
          ],
          const SizedBox(height: 12),
          Text(context.l10n.assistantLocalHelp),
          const SizedBox(height: 20),
          shad.PrimaryButton(
            onPressed: onManage,
            child: Text(context.l10n.assistantLocalModeAction),
          ),
        ],
      ),
    ),
  );
}
