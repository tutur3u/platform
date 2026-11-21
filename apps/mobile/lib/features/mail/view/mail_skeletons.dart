import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';

/// A foreground tint that reads on any surface the skeleton sits on,
/// including muted page backgrounds.
Color _skeletonColor(BuildContext context) {
  final colors = AppTokens.of(context).colorScheme;
  return colors.foreground.withValues(alpha: colors.isDark ? 0.12 : 0.08);
}

class _Bar extends StatelessWidget {
  const _Bar(this.widthFactor, {this.height = 12});

  final double widthFactor;
  final double height;

  @override
  Widget build(BuildContext context) => FractionallySizedBox(
    alignment: AlignmentDirectional.centerStart,
    widthFactor: widthFactor,
    child: Container(
      height: height,
      decoration: BoxDecoration(
        color: _skeletonColor(context),
        borderRadius: BorderRadius.circular(AppRadius.pill),
      ),
    ),
  );
}

class _Dot extends StatelessWidget {
  const _Dot(this.size);

  final double size;

  @override
  Widget build(BuildContext context) => Container(
    width: size,
    height: size,
    decoration: BoxDecoration(
      color: _skeletonColor(context),
      shape: BoxShape.circle,
    ),
  );
}

/// Inbox rows in the shape of `MailMessageTile`: sender and date, subject,
/// and a two-line snippet.
class MailInboxSkeleton extends StatelessWidget {
  const MailInboxSkeleton({this.count = 8, super.key});

  final int count;

  @override
  Widget build(BuildContext context) => ExcludeSemantics(
    key: const ValueKey('mail-inbox-skeleton'),
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (var index = 0; index < count; index++) ...[
          Padding(
            padding: const EdgeInsets.fromLTRB(36, 12, 16, 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(child: _Bar(index.isEven ? 0.5 : 0.38)),
                    const SizedBox(width: AppSpacing.md),
                    const SizedBox(width: 36, child: _Bar(1, height: 10)),
                  ],
                ),
                const SizedBox(height: AppSpacing.sm),
                _Bar(index.isEven ? 0.78 : 0.64),
                const SizedBox(height: AppSpacing.sm),
                const _Bar(0.94, height: 10),
                const SizedBox(height: AppSpacing.xs + AppSpacing.xxs),
                _Bar(index.isEven ? 0.6 : 0.7, height: 10),
              ],
            ),
          ),
          if (index < count - 1) const Divider(height: 1, indent: 36),
        ],
      ],
    ),
  );
}

/// One placeholder message: sender avatar, name and date, recipient line,
/// and [bodyLines] body lines.
class MailMessageSkeleton extends StatelessWidget {
  const MailMessageSkeleton({this.bodyLines = 6, super.key});

  final int bodyLines;

  static const _widths = [0.96, 0.9, 0.98, 0.84, 0.92, 0.6];

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: AppSpacing.md),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Row(
          children: [
            _Dot(28),
            SizedBox(width: AppSpacing.md),
            Expanded(child: _Bar(0.46, height: 14)),
            SizedBox(width: AppSpacing.md),
            SizedBox(width: 48, child: _Bar(1, height: 10)),
          ],
        ),
        const SizedBox(height: AppSpacing.md),
        const Padding(
          padding: EdgeInsetsDirectional.only(start: 40),
          child: _Bar(0.4, height: 10),
        ),
        if (bodyLines > 0) const SizedBox(height: AppSpacing.xl),
        for (var line = 0; line < bodyLines; line++) ...[
          _Bar(
            line == bodyLines - 1 ? 0.55 : _widths[line % (_widths.length - 1)],
          ),
          const SizedBox(height: AppSpacing.md),
        ],
      ],
    ),
  );
}

/// The opening frame of a conversation whose body is still loading: the
/// header row, collapsed earlier messages and the newest one expanded.
class MailThreadSkeleton extends StatelessWidget {
  const MailThreadSkeleton({this.collapsed = 1, super.key});

  /// Collapsed earlier messages shown above the expanded newest one.
  final int collapsed;

  @override
  Widget build(BuildContext context) => ExcludeSemantics(
    key: const ValueKey('mail-thread-skeleton'),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Padding(
          padding: EdgeInsets.symmetric(vertical: AppSpacing.sm),
          child: Row(
            children: [
              SizedBox(width: 72, child: _Bar(1, height: 10)),
              SizedBox(width: AppSpacing.md),
              SizedBox(width: 56, child: _Bar(1, height: 18)),
            ],
          ),
        ),
        for (var index = 0; index < collapsed; index++) ...[
          const MailMessageSkeleton(bodyLines: 0),
          const Divider(height: 1),
        ],
        const MailMessageSkeleton(),
      ],
    ),
  );
}
