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
    final isDark = theme.brightness == Brightness.dark;
    final shellBackground = Color.alphaBlend(
      prompt.shadow.withValues(alpha: isDark ? 0.3 : 0.2),
      prompt.background,
    );

    return InkWell(
      borderRadius: BorderRadius.circular(26),
      onTap: onTap,
      child: Material(
        color: shellBackground,
        borderRadius: BorderRadius.circular(26),
        clipBehavior: Clip.antiAlias,
        child: Container(
          width: double.infinity,
          constraints: const BoxConstraints(minHeight: 132),
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(26),
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [
                Color.alphaBlend(
                  prompt.iconBackground.withValues(alpha: 0.2),
                  prompt.background,
                ),
                shellBackground,
              ],
            ),
            border: Border.all(color: prompt.border.withValues(alpha: 0.95)),
            boxShadow: [
              BoxShadow(
                color: prompt.border.withValues(alpha: isDark ? 0.18 : 0.12),
                blurRadius: 30,
                spreadRadius: 2,
              ),
              BoxShadow(
                color: prompt.shadow.withValues(alpha: isDark ? 0.32 : 0.16),
                blurRadius: 20,
                offset: const Offset(0, 10),
              ),
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: prompt.iconBackground,
                  borderRadius: BorderRadius.circular(15),
                ),
                child: Icon(
                  prompt.icon,
                  color: prompt.iconColor,
                  size: 22,
                ),
              ),
              const SizedBox(height: 14),
              Text(
                prompt.label,
                style: theme.textTheme.titleLarge?.copyWith(
                  color: prompt.textColor,
                  fontWeight: FontWeight.w800,
                  height: 1.16,
                ),
              ),
              const SizedBox(height: 10),
              Text(
                prompt.caption,
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: prompt.textColor.withValues(alpha: 0.78),
                  height: 1.32,
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
  final palettes = List.generate(
    4,
    (index) => AppCardPalette.resolve(context, index: index),
  );

  return [
    _StarterPrompt(
      label: context.l10n.assistantStarterFocus,
      prompt: context.l10n.assistantStarterFocus,
      caption: context.l10n.assistantStarterCaptionFocus,
      icon: Icons.track_changes_rounded,
      background: palettes[0].background,
      border: palettes[0].border,
      shadow: palettes[0].shadow,
      iconBackground: palettes[0].iconBackground,
      iconColor: palettes[0].iconColor,
      textColor: palettes[0].textColor,
    ),
    _StarterPrompt(
      label: context.l10n.assistantStarterPlan,
      prompt: context.l10n.assistantStarterPlan,
      caption: context.l10n.assistantStarterCaptionPlan,
      icon: Icons.event_note_rounded,
      background: palettes[1].background,
      border: palettes[1].border,
      shadow: palettes[1].shadow,
      iconBackground: palettes[1].iconBackground,
      iconColor: palettes[1].iconColor,
      textColor: palettes[1].textColor,
    ),
    _StarterPrompt(
      label: context.l10n.assistantStarterBacklog,
      prompt: context.l10n.assistantStarterBacklog,
      caption: context.l10n.assistantStarterCaptionBacklog,
      icon: Icons.inventory_2_outlined,
      background: palettes[3].background,
      border: palettes[3].border,
      shadow: palettes[3].shadow,
      iconBackground: palettes[3].iconBackground,
      iconColor: palettes[3].iconColor,
      textColor: palettes[3].textColor,
    ),
    _StarterPrompt(
      label: context.l10n.assistantStarterDraft,
      prompt: context.l10n.assistantStarterDraft,
      caption: context.l10n.assistantStarterCaptionDraft,
      icon: Icons.edit_outlined,
      background: palettes[2].background,
      border: palettes[2].border,
      shadow: palettes[2].shadow,
      iconBackground: palettes[2].iconBackground,
      iconColor: palettes[2].iconColor,
      textColor: palettes[2].textColor,
    ),
  ];
}
