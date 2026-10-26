import 'package:flutter/material.dart';
import 'package:mobile/core/layout/grouped_rows.dart';
import 'package:mobile/core/layout/grouped_section.dart';
import 'package:mobile/core/ui/ui.dart';
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
        SizedBox(height: MediaQuery.sizeOf(context).height < 600 ? 24 : 48),
        StaggeredEntrance(
          replayKey: 'assistant-starter-title-$replayToken',
          child: Text(
            context.l10n.assistantStarterTitle,
            style: Theme.of(
              context,
            ).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800),
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
        // One grouped card of rows, like Settings: no shadows or gradients on
        // list content. Labels allow four lines (AppGroupedRow's default is
        // two) so long translations at large text are not cut; captions wrap
        // in full.
        StaggeredEntrance(
          replayKey: 'assistant-starter-rows-$replayToken',
          delay: const Duration(milliseconds: 140),
          child: AppGroupedCard(
            children: [
              for (final prompt in prompts)
                AppGroupedRow(
                  key: ValueKey('assistant-starter-${prompt.prompt}'),
                  leading: AppIconTile(icon: prompt.icon, tone: prompt.tone),
                  title: Text(
                    prompt.label,
                    maxLines: 4,
                    overflow: TextOverflow.ellipsis,
                  ),
                  subtitle: Text(prompt.caption),
                  onTap: () => onPromptSelected(prompt.prompt),
                ),
            ],
          ),
        ),
      ],
    );
  }
}

class _StarterPrompt {
  const _StarterPrompt({
    required this.label,
    required this.prompt,
    required this.caption,
    required this.icon,
    required this.tone,
  });

  final String label;
  final String prompt;
  final String caption;
  final IconData icon;
  final AppTone tone;
}

List<_StarterPrompt> _starterPrompts(BuildContext context) {
  final l10n = context.l10n;
  return [
    _StarterPrompt(
      label: l10n.assistantStarterFocus,
      prompt: l10n.assistantStarterFocus,
      caption: l10n.assistantStarterCaptionFocus,
      icon: LucideIcons.target,
      tone: AppTone.success,
    ),
    _StarterPrompt(
      label: l10n.assistantStarterPlan,
      prompt: l10n.assistantStarterPlan,
      caption: l10n.assistantStarterCaptionPlan,
      icon: LucideIcons.calendarDays,
      tone: AppTone.info,
    ),
    _StarterPrompt(
      label: l10n.assistantStarterBacklog,
      prompt: l10n.assistantStarterBacklog,
      caption: l10n.assistantStarterCaptionBacklog,
      icon: LucideIcons.package,
      tone: AppTone.warning,
    ),
    _StarterPrompt(
      label: l10n.assistantStarterDraft,
      prompt: l10n.assistantStarterDraft,
      caption: l10n.assistantStarterCaptionDraft,
      icon: LucideIcons.pencil,
      tone: AppTone.primary,
    ),
  ];
}
