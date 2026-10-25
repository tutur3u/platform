import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/assistant/models/assistant_live_call_phase.dart';
import 'package:mobile/features/assistant/widgets/assistant_live_call_timer.dart';
import 'package:mobile/features/assistant/widgets/assistant_live_playback_blob.dart';
import 'package:mobile/l10n/l10n.dart';

/// Caller identity for the Live call surface: a voice-reactive orb, the
/// assistant name and a single status line. Connected calls show the
/// elapsed timer in place of a status label.
class AssistantLiveCallHeader extends StatelessWidget {
  const AssistantLiveCallHeader({
    required this.assistantName,
    required this.phase,
    required this.energy,
    required this.bands,
    required this.speaking,
    required this.muted,
    this.startedAt,
    this.endedDuration,
    this.orbSize = 220,
    super.key,
  });

  final String assistantName;
  final AssistantLiveCallPhase phase;
  final double energy;
  final List<double> bands;
  final bool speaking;
  final bool muted;
  final DateTime? startedAt;
  final Duration? endedDuration;
  final double orbSize;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = theme.colorScheme;
    final secondary = theme.textTheme.titleMedium?.copyWith(
      color: colors.onSurfaceVariant,
    );
    final startedAt = this.startedAt;
    final status = switch (phase) {
      AssistantLiveCallPhase.connected when startedAt != null =>
        AssistantLiveCallTimer(startedAt: startedAt, style: secondary),
      AssistantLiveCallPhase.ended when endedDuration != null => Text(
        context.l10n.assistantLiveCallEndedWithDuration(
          formatAssistantLiveCallDuration(endedDuration!),
        ),
        style: secondary,
      ),
      _ => Text(phase.label(context.l10n), style: secondary),
    };

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        SizedBox.square(
          dimension: orbSize,
          child: Stack(
            alignment: Alignment.center,
            children: [
              if (phase == AssistantLiveCallPhase.connecting ||
                  phase == AssistantLiveCallPhase.reconnecting)
                _ConnectingRing(color: colors.primary, size: orbSize),
              // The Stack loosens constraints, so give the blob a definite
              // square that scales with the orb on phones and tablets.
              SizedBox.square(
                dimension: orbSize * .72,
                child: FittedBox(
                  child: AssistantLivePlaybackBlob(
                    energy: energy,
                    bands: bands,
                    active:
                        phase == AssistantLiveCallPhase.connected && speaking,
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.lg),
        Semantics(
          header: true,
          child: Text(
            assistantName,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: theme.textTheme.headlineMedium?.copyWith(
              color: colors.onSurface,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
        const SizedBox(height: AppSpacing.xs),
        Semantics(
          liveRegion: phase != AssistantLiveCallPhase.connected,
          child: status,
        ),
        if (muted && phase == AssistantLiveCallPhase.connected) ...[
          const SizedBox(height: AppSpacing.sm),
          _MutedBadge(label: context.l10n.assistantLiveCallMuted),
        ],
      ],
    );
  }
}

/// Expanding ring while the call connects. It owns its ticker and repaints
/// alone; reduced motion shows a static ring.
class _ConnectingRing extends StatefulWidget {
  const _ConnectingRing({required this.color, required this.size});

  final Color color;
  final double size;

  @override
  State<_ConnectingRing> createState() => _ConnectingRingState();
}

class _ConnectingRingState extends State<_ConnectingRing>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1600),
  );

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (MediaQuery.disableAnimationsOf(context)) {
      _controller
        ..stop()
        ..value = .5;
    } else if (!_controller.isAnimating) {
      _controller.repeat();
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => ExcludeSemantics(
    child: RepaintBoundary(
      child: AnimatedBuilder(
        animation: _controller,
        builder: (context, _) {
          final t = _controller.value;
          return Container(
            width: widget.size * (.62 + .38 * t),
            height: widget.size * (.62 + .38 * t),
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              border: Border.all(
                color: widget.color.withValues(alpha: .45 * (1 - t)),
                width: 2,
              ),
            ),
          );
        },
      ),
    ),
  );
}

class _MutedBadge extends StatelessWidget {
  const _MutedBadge({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: colors.onSurface.withValues(alpha: .08),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(LucideIcons.micOff, size: 14, color: colors.onSurfaceVariant),
            const SizedBox(width: 6),
            Text(
              label,
              style: Theme.of(
                context,
              ).textTheme.labelMedium?.copyWith(color: colors.onSurfaceVariant),
            ),
          ],
        ),
      ),
    );
  }
}
