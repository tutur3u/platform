import 'package:flutter/material.dart';
import 'package:mobile/features/assistant/models/assistant_live_startup_timings.dart';
import 'package:mobile/l10n/l10n.dart';

/// Duration-only view of the current in-memory attempt. No telemetry is sent.
class AssistantLiveStartupDiagnostics extends StatelessWidget {
  const AssistantLiveStartupDiagnostics({required this.timings, super.key});

  final Map<AssistantLiveStartupPhase, int> timings;

  @override
  Widget build(BuildContext context) {
    if (timings.isEmpty) return const SizedBox.shrink();
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final labels = {
      AssistantLiveStartupPhase.token: l10n.assistantLiveStartupToken,
      AssistantLiveStartupPhase.history: l10n.assistantLiveStartupHistory,
      AssistantLiveStartupPhase.audio: l10n.assistantLiveStartupAudio,
      AssistantLiveStartupPhase.socket: l10n.assistantLiveStartupSocket,
      AssistantLiveStartupPhase.ready: l10n.assistantLiveStartupReady,
      AssistantLiveStartupPhase.total: l10n.assistantLiveStartupTotal,
    };
    return Padding(
      padding: const EdgeInsets.only(top: 18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            l10n.assistantLiveStartupTitle,
            style: theme.textTheme.titleSmall,
          ),
          const SizedBox(height: 8),
          Text(
            l10n.assistantLiveStartupNote,
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
          const SizedBox(height: 8),
          for (final phase in AssistantLiveStartupPhase.values)
            if (timings[phase] case final int milliseconds)
              Padding(
                key: ValueKey('live-startup-${phase.name}'),
                padding: const EdgeInsets.symmetric(vertical: 5),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(child: Text(labels[phase]!)),
                    const SizedBox(width: 12),
                    Flexible(
                      child: Text(
                        l10n.assistantLiveStartupDuration(milliseconds),
                        textAlign: TextAlign.end,
                      ),
                    ),
                  ],
                ),
              ),
        ],
      ),
    );
  }
}
