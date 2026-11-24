import 'package:flutter/material.dart';
import 'package:flutter_quill/flutter_quill.dart';
import 'package:mobile/core/layout/layout_tokens.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';
import 'package:mobile/features/tasks_boards/utils/tiptap_quill_models.dart'
    show taskDescriptionDividerEmbedType;

/// Renders a TipTap horizontal rule as a hairline across the description,
/// as the web does.
class TaskDescriptionDividerEmbedBuilder extends EmbedBuilder {
  const TaskDescriptionDividerEmbedBuilder();

  @override
  String get key => taskDescriptionDividerEmbedType;

  @override
  Widget build(BuildContext context, EmbedContext embedContext) {
    final c = AppTokens.of(context).colorScheme;
    return Padding(
      key: const ValueKey('task-description-divider'),
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.md),
      child: SizedBox(
        width: double.infinity,
        height: 1,
        child: ColoredBox(color: c.border),
      ),
    );
  }
}
