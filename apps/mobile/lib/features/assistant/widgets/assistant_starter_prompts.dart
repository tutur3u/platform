import 'package:flutter/material.dart';
import 'package:mobile/features/apps/widgets/app_card_palette.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/staggered_entrance.dart';

class AssistantStarterPrompts extends StatelessWidget {
  const AssistantStarterPrompts({
    required this.onPromptSelected,
    this.replayToken = 0,
    super.key,
  });

  final ValueChanged<String> onPromptSelected;
  final int replayToken;

  @override
  Widget build(BuildContext context) {
    final prompts = _starterPrompts(context);

    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: 192),
        StaggeredEntrance(
          replayKey: 'assistant-starter-title-$replayToken',
          child: Text(
            context.l10n.assistantStarterTitle,
            style: Theme.of(context).textTheme.headlineSmall?.copyWith(
              fontWeight: FontWeight.w800,
            ),
            textAlign: TextAlign.center,
          ),
        ),
        const SizedBox(height: 8),
        StaggeredEntrance(
          replayKey: 'assistant-starter-subtitle-$replayToken',
          delay: const Duration(milliseconds: 70),
          child: Text(
            context.l10n.assistantStarterSubtitle,
            style: Theme.of(context).textTheme.bodyLarge?.copyWith(
              color: Theme.of(context).colorScheme.onSurfaceVariant,
            ),
            textAlign: TextAlign.center,
          ),
        ),
        const SizedBox(height: 24),
        for (var index = 0; index < prompts.length; index++) ...[
          StaggeredEntrance(
            replayKey:
                'assistant-starter-${prompts[index].prompt}-$replayToken',
            delay: Duration(milliseconds: 140 + (index * 70)),
            child: _StarterPromptCard(
              prompt: prompts[index],
              onTap: () => onPromptSelected(prompts[index].prompt),
            ),
          ),
          if (index < prompts.length - 1) const SizedBox(height: 12),
        ],
      ],
    );
  }
}

class _StarterPromptCard extends StatelessWidget {
  const _StarterPromptCard({
    required this.prompt,
    required this.onTap,
  });

  final _StarterPrompt prompt;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final surfaceColor = Color.alphaBlend(
      prompt.shadow.withValues(alpha: 0.22),
      prompt.background,
    );

    return InkWell(
      borderRadius: BorderRadius.circular(26),
      onTap: onTap,
      child: Material(
        color: surfaceColor,
        borderRadius: BorderRadius.circular(26),
        clipBehavior: Clip.antiAlias,
        child: Container(
          width: double.infinity,
          constraints: const BoxConstraints(minHeight: 126),
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(26),
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [
                Color.alphaBlend(
                  prompt.iconBackground.withValues(alpha: 0.14),
                  prompt.background,
                ),
                surfaceColor,
              ],
            ),
            border: Border.all(color: prompt.border.withValues(alpha: 0.95)),
            boxShadow: [
              BoxShadow(
                color: prompt.shadow,
                blurRadius: 18,
                offset: const Offset(0, 10),
              ),
            ],
          ),
          child: Row(
            children: [
              Container(
                width: 58,
                height: 58,
                decoration: BoxDecoration(
                  color: prompt.iconBackground,
                  borderRadius: BorderRadius.circular(18),
                ),
                child: Icon(
                  prompt.icon,
                  color: prompt.iconColor,
                  size: 28,
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      prompt.label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.titleLarge?.copyWith(
                        color: prompt.textColor,
                        fontWeight: FontWeight.w900,
                        height: 1.05,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      prompt.caption,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.bodyLarge?.copyWith(
                        color: prompt.textColor.withValues(alpha: 0.8),
                        height: 1.34,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _StarterPrompt {
  const _StarterPrompt({
    required this.label,
    required this.prompt,
    required this.caption,
    required this.icon,
    required this.background,
    required this.border,
    required this.shadow,
    required this.iconBackground,
    required this.iconColor,
    required this.textColor,
  });

  final String label;
  final String prompt;
  final String caption;
  final IconData icon;
  final Color background;
  final Color border;
  final Color shadow;
  final Color iconBackground;
  final Color iconColor;
  final Color textColor;
}

List<_StarterPrompt> _starterPrompts(BuildContext context) {
  final focusPalette = AppCardPalette.resolve(
    context,
    index: 0,
    moduleId: 'drive',
  );
  final planPalette = AppCardPalette.resolve(
    context,
    index: 1,
    moduleId: 'calendar',
  );
  final backlogPalette = AppCardPalette.resolve(
    context,
    index: 2,
    moduleId: 'finance',
  );
  final draftPalette = AppCardPalette.resolve(
    context,
    index: 3,
    moduleId: 'crm',
  );

  return [
    _StarterPrompt(
      label: context.l10n.assistantStarterFocus,
      prompt: context.l10n.assistantStarterFocus,
      caption: context.l10n.assistantStarterCaptionFocus,
      icon: Icons.track_changes_rounded,
      background: focusPalette.background,
      border: focusPalette.border,
      shadow: focusPalette.shadow,
      iconBackground: focusPalette.iconBackground,
      iconColor: focusPalette.iconColor,
      textColor: focusPalette.textColor,
    ),
    _StarterPrompt(
      label: context.l10n.assistantStarterPlan,
      prompt: context.l10n.assistantStarterPlan,
      caption: context.l10n.assistantStarterCaptionPlan,
      icon: Icons.event_note_rounded,
      background: planPalette.background,
      border: planPalette.border,
      shadow: planPalette.shadow,
      iconBackground: planPalette.iconBackground,
      iconColor: planPalette.iconColor,
      textColor: planPalette.textColor,
    ),
    _StarterPrompt(
      label: context.l10n.assistantStarterBacklog,
      prompt: context.l10n.assistantStarterBacklog,
      caption: context.l10n.assistantStarterCaptionBacklog,
      icon: Icons.inventory_2_outlined,
      background: backlogPalette.background,
      border: backlogPalette.border,
      shadow: backlogPalette.shadow,
      iconBackground: backlogPalette.iconBackground,
      iconColor: backlogPalette.iconColor,
      textColor: backlogPalette.textColor,
    ),
    _StarterPrompt(
      label: context.l10n.assistantStarterDraft,
      prompt: context.l10n.assistantStarterDraft,
      caption: context.l10n.assistantStarterCaptionDraft,
      icon: Icons.edit_outlined,
      background: draftPalette.background,
      border: draftPalette.border,
      shadow: draftPalette.shadow,
      iconBackground: draftPalette.iconBackground,
      iconColor: draftPalette.iconColor,
      textColor: draftPalette.textColor,
    ),
  ];
}
