import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/l10n/l10n.dart';

enum AssistantConversationPeriod { today, thisWeek, earlier }

class AssistantConversationRow extends StatelessWidget {
  const AssistantConversationRow({
    required this.chat,
    required this.selected,
    required this.period,
    required this.onTap,
    super.key,
  });

  final AssistantChatRecord chat;
  final bool selected;
  final AssistantConversationPeriod period;
  final VoidCallback onTap;

  String _formatActivity(BuildContext context, DateTime date) {
    final material = MaterialLocalizations.of(context);
    return switch (period) {
      AssistantConversationPeriod.today => material.formatTimeOfDay(
        TimeOfDay.fromDateTime(date),
        alwaysUse24HourFormat: MediaQuery.alwaysUse24HourFormatOf(context),
      ),
      AssistantConversationPeriod.thisWeek => DateFormat.EEEE(
        context.l10n.localeName,
      ).format(date),
      AssistantConversationPeriod.earlier => material.formatShortDate(date),
    };
  }

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final colors = tokens.colorScheme;
    final type = tokens.typography;
    final tone = tokens.infoTone;
    final l10n = context.l10n;
    final activity = chat.activityDate?.toLocal();
    final muted = colors.mutedForeground;
    final ink = selected ? tokens.selectionTone.ink : colors.foreground;
    final title = chat.title?.trim() ?? '';
    final preview = chat.preview?.trim() ?? '';
    return Semantics(
      button: true,
      selected: selected,
      child: Material(
        color: selected ? tokens.selectionTone.fill : Colors.transparent,
        child: InkWell(
          onTap: onTap,
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 68),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              child: Row(
                children: [
                  DecoratedBox(
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: tone.fill,
                    ),
                    child: SizedBox.square(
                      dimension: 40,
                      child: Icon(
                        LucideIcons.sparkles,
                        size: 20,
                        color: tone.ink,
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: Text(
                                title.isEmpty
                                    ? l10n.assistantUntitledChat
                                    : title,
                                style: type.body
                                    .merge(type.bold)
                                    .copyWith(color: ink),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                            if (activity != null) ...[
                              const SizedBox(width: 8),
                              Text(
                                _formatActivity(context, activity),
                                style: type.numeric.copyWith(color: muted),
                              ),
                            ],
                          ],
                        ),
                        Text(
                          preview.isEmpty
                              ? l10n.assistantConversationNoPreview
                              : preview.replaceAll(RegExp(r'\s+'), ' '),
                          style: type.bodySm.copyWith(color: muted),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
