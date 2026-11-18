import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/theme/sorbet/sorbet_tokens.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/l10n/l10n.dart';

class AssistantConversationRow extends StatelessWidget {
  const AssistantConversationRow({
    required this.chat,
    required this.selected,
    required this.onTap,
    super.key,
  });

  final AssistantChatRecord chat;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final colors = tokens.colorScheme;
    final type = tokens.typography;
    final sorbet = SorbetTokens.maybeOf(context);
    final l10n = context.l10n;
    final activity = chat.activityDate?.toLocal();
    final muted = colors.mutedForeground;
    final ink = selected
        ? sorbet?.navSelectedInk ?? colors.accentForeground
        : colors.foreground;
    final title = chat.title?.trim() ?? '';
    final preview = chat.preview?.trim() ?? '';
    return Semantics(
      button: true,
      selected: selected,
      child: Material(
        color: selected
            ? sorbet?.navSelectedFill ?? colors.accent
            : Colors.transparent,
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
                      color:
                          sorbet?.hues.blue.fill ?? AppTone.info.fill(colors),
                    ),
                    child: SizedBox.square(
                      dimension: 40,
                      child: Icon(
                        LucideIcons.sparkles,
                        size: 20,
                        color: sorbet?.hues.blue.ink ?? colors.info,
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
                                DateFormat.Hm(l10n.localeName).format(activity),
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
