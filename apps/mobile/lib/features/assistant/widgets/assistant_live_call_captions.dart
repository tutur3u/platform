import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/assistant/cubit/assistant_live_cubit.dart';
import 'package:mobile/l10n/l10n.dart';

/// One spoken line in the captions drawer.
typedef AssistantLiveCaption = ({bool fromAssistant, String text});

/// Newest-last caption lines from recent turns plus the in-progress drafts.
List<AssistantLiveCaption> assistantLiveCaptions(
  AssistantLiveState state, {
  int maxTurns = 3,
}) {
  final lines = <AssistantLiveCaption>[];
  void add(String text, {required bool fromAssistant}) {
    final trimmed = text.trim();
    if (trimmed.isNotEmpty) {
      lines.add((fromAssistant: fromAssistant, text: trimmed));
    }
  }

  final turns = state.completedTurns;
  for (final turn in turns.skip(
    turns.length > maxTurns ? turns.length - maxTurns : 0,
  )) {
    add(
      turn.userText.isNotEmpty ? turn.userText : turn.userTranscript,
      fromAssistant: false,
    );
    add(
      turn.assistantText.isNotEmpty
          ? turn.assistantText
          : turn.assistantTranscript,
      fromAssistant: true,
    );
  }
  add(
    state.userDraft.isNotEmpty ? state.userDraft : state.userTranscript,
    fromAssistant: false,
  );
  add(
    state.assistantDraft.isNotEmpty
        ? state.assistantDraft
        : state.assistantTranscript,
    fromAssistant: true,
  );
  return lines;
}

/// Live captions drawer. Lines are anchored to the bottom so the newest
/// speech stays visible without programmatic scrolling.
class AssistantLiveCallCaptions extends StatelessWidget {
  const AssistantLiveCallCaptions({
    required this.captions,
    required this.assistantName,
    this.maxHeight = 220,
    super.key,
  });

  final List<AssistantLiveCaption> captions;
  final String assistantName;
  final double maxHeight;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = theme.colorScheme;
    final l10n = context.l10n;
    return Semantics(
      container: true,
      label: l10n.assistantLiveCallCaptions,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: colors.surfaceContainerHighest.withValues(alpha: .72),
          borderRadius: BorderRadius.circular(AppRadius.card),
        ),
        child: ConstrainedBox(
          constraints: BoxConstraints(maxHeight: maxHeight, minHeight: 72),
          child: captions.isEmpty
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(AppSpacing.lg),
                    child: Text(
                      l10n.assistantLiveCallCaptionsEmpty,
                      textAlign: TextAlign.center,
                      style: theme.textTheme.bodyMedium?.copyWith(
                        color: colors.onSurfaceVariant,
                      ),
                    ),
                  ),
                )
              : ListView.builder(
                  reverse: true,
                  shrinkWrap: true,
                  padding: const EdgeInsets.all(AppSpacing.lg),
                  itemCount: captions.length,
                  itemBuilder: (context, index) {
                    final caption = captions[captions.length - 1 - index];
                    final speaker = caption.fromAssistant
                        ? assistantName
                        : l10n.assistantLiveCallYou;
                    return Padding(
                      padding: const EdgeInsets.only(top: AppSpacing.sm),
                      child: Text.rich(
                        TextSpan(
                          children: [
                            TextSpan(
                              text: '$speaker  ',
                              style: theme.textTheme.labelLarge?.copyWith(
                                color: caption.fromAssistant
                                    ? colors.primary
                                    : colors.onSurfaceVariant,
                              ),
                            ),
                            TextSpan(text: caption.text),
                          ],
                        ),
                        style: theme.textTheme.bodyLarge?.copyWith(
                          color: colors.onSurface,
                        ),
                      ),
                    );
                  },
                ),
        ),
      ),
    );
  }
}
