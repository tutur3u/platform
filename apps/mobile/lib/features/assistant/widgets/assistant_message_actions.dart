import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/l10n/l10n.dart';

enum AssistantReaction {
  like('\u{1f44d}', LucideIcons.thumbsUp),
  love('\u2764\ufe0f', LucideIcons.heart),
  celebrate('\u{1f389}', LucideIcons.partyPopper),
  insightful('\u{1f4a1}', LucideIcons.lightbulb);

  const AssistantReaction(this.value, this.icon);
  final String value;
  final IconData icon;

  String label(AppLocalizations l10n) => switch (this) {
    like => l10n.assistantReactionLike,
    love => l10n.assistantReactionLove,
    celebrate => l10n.assistantReactionCelebrate,
    insightful => l10n.assistantReactionInsightful,
  };

  static AssistantReaction? parse(String value) {
    for (final reaction in values) {
      if (reaction.value == value) return reaction;
    }
    return null;
  }
}

sealed class AssistantMessageAction {
  const AssistantMessageAction();
}

class AssistantCopyMessage extends AssistantMessageAction {
  const AssistantCopyMessage();
}

class AssistantReplyToMessage extends AssistantMessageAction {
  const AssistantReplyToMessage();
}

class AssistantReactToMessage extends AssistantMessageAction {
  const AssistantReactToMessage(this.reaction);
  final String reaction;
}

class AssistantRefreshReactions extends AssistantMessageAction {
  const AssistantRefreshReactions();
}

class AssistantMessageActions extends StatelessWidget {
  const AssistantMessageActions({
    required this.canCopy,
    required this.canReply,
    required this.canReact,
    this.canRefresh = false,
    this.selectedReactions = const {},
    super.key,
  });

  final bool canCopy;
  final bool canReply;
  final bool canReact;
  final bool canRefresh;
  final Set<String> selectedReactions;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return AppSheetScaffold(
      title: l10n.assistantMessageActionsTitle,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (canReact)
            Wrap(
              alignment: WrapAlignment.spaceEvenly,
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final reaction in AssistantReaction.values)
                  MergeSemantics(
                    child: Semantics(
                      selected: selectedReactions.contains(reaction.value),
                      child: AppIconButton(
                        key: ValueKey('assistant-react-${reaction.name}'),
                        tooltip: reaction.label(l10n),
                        variant: selectedReactions.contains(reaction.value)
                            ? AppButtonVariant.primary
                            : AppButtonVariant.ghost,
                        icon: Icon(reaction.icon),
                        onPressed: () => Navigator.of(
                          context,
                        ).pop(AssistantReactToMessage(reaction.value)),
                      ),
                    ),
                  ),
              ],
            ),
          if (canCopy)
            AppListTile(
              leading: const Icon(LucideIcons.copy),
              title: Text(l10n.assistantCopyMessageAction),
              onTap: () =>
                  Navigator.of(context).pop(const AssistantCopyMessage()),
            ),
          if (canRefresh)
            AppListTile(
              leading: const Icon(LucideIcons.refreshCw),
              title: Text(l10n.assistantRefreshReactions),
              onTap: () =>
                  Navigator.of(context).pop(const AssistantRefreshReactions()),
            ),
          if (canReply)
            AppListTile(
              leading: const Icon(LucideIcons.reply),
              title: Text(l10n.assistantReplyMessageAction),
              onTap: () =>
                  Navigator.of(context).pop(const AssistantReplyToMessage()),
            ),
        ],
      ),
    );
  }
}
