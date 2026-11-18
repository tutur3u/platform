import 'package:flutter/material.dart';
import 'package:mobile/core/layout/grouped_rows.dart';
import 'package:mobile/core/layout/layout_tokens.dart';
import 'package:mobile/core/ui/components/app_tap_target.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';
import 'package:mobile/features/profile/profile_timeline_repository.dart';
import 'package:mobile/features/profile/view/profile_surface.dart';
import 'package:mobile/features/profile/view/profile_timeline_grouping.dart';

/// One activity: its time in the gutter, the source tile on the day's rail,
/// and a card with the title and a source pill. Activities that have a
/// destination open it on tap.
class ProfileTimelineRow extends StatelessWidget {
  const ProfileTimelineRow({
    required this.item,
    required this.time,
    required this.timeWidth,
    required this.last,
    this.inlineTime = false,
    this.onOpen,
    super.key,
  });

  static const double tileSize = 36;
  static const double gap = 10;

  final ProfileTimelineItem item;

  /// The formatted time of day.
  final String time;

  /// Width of the time gutter, shared by every row so the rail stays
  /// straight.
  final double timeWidth;

  /// The rail continues below every row of a day except its last.
  final bool last;

  /// Shows the time inside the card instead of in a gutter, for narrow
  /// widths and large text.
  final bool inlineTime;
  final ValueChanged<ProfileTimelineItem>? onOpen;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final type = tokens.typography;
    final kind = item.kindLabel(context);
    final title = item.trimmedTitle;
    final open = item.canOpen ? onOpen : null;
    final card = profileCardDecoration(
      context,
    ).copyWith(borderRadius: BorderRadius.circular(tokens.shapes.card * 2 / 3));
    // Untitled rows still meet the minimum tap target.
    final body = Container(
      constraints: const BoxConstraints(minHeight: kAppMinTapTarget),
      alignment: AlignmentDirectional.centerStart,
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.md,
        vertical: AppSpacing.sm + AppSpacing.xxs,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          if (inlineTime) ...[
            Text(
              time,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: type.caption.copyWith(
                color: c.mutedForeground,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: AppSpacing.xxs),
          ],
          Text(
            title ?? kind,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: type.ui.copyWith(
              color: c.foreground,
              fontWeight: FontWeight.w700,
            ),
          ),
          if (title != null) ...[
            const SizedBox(height: AppSpacing.sm),
            _SourcePill(label: kind, tone: item.kindTone),
          ],
        ],
      ),
    );
    return Semantics(
      button: open != null,
      onTap: open == null ? null : () => open(item),
      label: [?title, kind, time].join(', '),
      excludeSemantics: true,
      child: CustomPaint(
        painter: last
            ? null
            : _RailPainter(
                color: c.border,
                x: (inlineTime ? 0 : timeWidth + gap) + tileSize / 2,
                top: _rowPadding + tileSize + AppSpacing.xs,
              ),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: _rowPadding),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (!inlineTime) ...[
                SizedBox(
                  width: timeWidth,
                  child: Padding(
                    padding: const EdgeInsets.only(top: AppSpacing.sm + 1),
                    child: Text(
                      time,
                      textAlign: TextAlign.right,
                      maxLines: 1,
                      style: type.numeric.copyWith(
                        color: c.mutedForeground,
                        fontWeight: FontWeight.w700,
                        fontFeatures: const [FontFeature.tabularFigures()],
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: gap),
              ],
              AppIconTile(
                icon: item.kindIcon,
                tone: item.kindTone,
                size: tileSize,
              ),
              const SizedBox(width: gap),
              Expanded(
                child: DecoratedBox(
                  decoration: card,
                  child: Material(
                    type: MaterialType.transparency,
                    borderRadius: card.borderRadius,
                    clipBehavior: Clip.antiAlias,
                    child: open == null
                        ? body
                        : InkWell(onTap: () => open(item), child: body),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

const double _rowPadding = 6;

/// The activity's source as a small toned pill.
class _SourcePill extends StatelessWidget {
  const _SourcePill({required this.label, required this.tone});

  final String label;
  final AppTone tone;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final colors = tokens.colorScheme;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: tone.fill(colors),
        borderRadius: BorderRadius.circular(AppRadius.pill),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
        child: Text(
          label,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: tokens.typography.caption.copyWith(
            color: tone.foreground(colors),
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
    );
  }
}

/// The day's rail from below this row's tile to the next row's tile.
class _RailPainter extends CustomPainter {
  const _RailPainter({required this.color, required this.x, required this.top});

  final Color color;
  final double x;
  final double top;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..strokeWidth = 2
      ..strokeCap = StrokeCap.round;
    canvas.drawLine(
      Offset(x, top),
      Offset(x, size.height + _rowPadding - AppSpacing.xs),
      paint,
    );
  }

  @override
  bool shouldRepaint(_RailPainter old) =>
      old.color != color || old.x != x || old.top != top;
}
