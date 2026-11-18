import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:mobile/core/theme/sorbet/sorbet_palette_types.dart';
import 'package:mobile/core/theme/sorbet/sorbet_palettes.dart';
import 'package:mobile/core/theme/sorbet/sorbet_preferences.dart';
import 'package:mobile/core/theme/sorbet/sorbet_tokens.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';

/// Calm event surface for a timeline, horizontal home card or agenda list.
/// Omit [minutes] for content height; set [width] to 164 for a home strip.
/// A timeline can supply bounded height itself or use [minutes]/[hourHeight].
class AppEventBlock extends StatelessWidget {
  const AppEventBlock({
    required this.title,
    required this.timeLabel,
    this.tone = 'blue',
    this.minutes,
    this.hourHeight = 48,
    this.width,
    this.onTap,
    this.onLongPress,
    super.key,
  });
  final String title;
  final String timeLabel;
  final String tone;
  final double? minutes;
  final double hourHeight;
  final double? width;
  final VoidCallback? onTap;
  final VoidCallback? onLongPress;

  static SorbetHue hueOf(BuildContext context, String tone) {
    final hues =
        SorbetTokens.maybeOf(context)?.hues ??
        SorbetPalettes.hues(SorbetPreset.sorbet, Theme.of(context).brightness);
    return hues.byName[tone] ?? hues.blue;
  }

  @override
  Widget build(BuildContext context) {
    final hue = hueOf(context, tone);
    final tokens = AppTokens.of(context);
    final radius = BorderRadius.circular(tokens.shapes.card);
    return Semantics(
      button: onTap != null || onLongPress != null,
      onTap: onTap,
      onLongPress: onLongPress,
      label: [title, if (timeLabel.isNotEmpty) timeLabel].join(', '),
      excludeSemantics: true,
      child: SizedBox(
        width: width,
        height: minutes == null
            ? null
            : math.max(22, minutes! / 60 * hourHeight - 2),
        child: Material(
          color: SorbetTokens.maybeOf(context)?.eventFill(hue) ?? hue.calm,
          borderRadius: radius,
          child: InkWell(
            onTap: onTap,
            onLongPress: onLongPress,
            borderRadius: radius,
            child: LayoutBuilder(
              builder: (context, constraints) {
                final compact = constraints.maxHeight < 56;
                return Padding(
                  padding: EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: compact ? 2 : 8,
                  ),
                  child: ClipRect(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Flexible(
                          child: Text(
                            title,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: tokens.typography.uiSm.copyWith(
                              color: hue.ink,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                        if (!compact && timeLabel.isNotEmpty)
                          Text(
                            timeLabel,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: tokens.typography.numeric.copyWith(
                              color: hue.ink,
                            ),
                          ),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),
        ),
      ),
    );
  }
}
