import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';

class AppSlider extends StatelessWidget {
  const AppSlider({
    required this.value,
    required this.onChanged,
    this.min = 0,
    this.max = 1,
    this.divisions,
    this.label,
    this.onChangeEnd,
    super.key,
  }) : assert(max > min, 'max must exceed min'),
       assert(divisions == null || divisions > 0, 'divisions must be positive');

  final double value;
  final double min;
  final double max;
  final int? divisions;
  final String? label;
  final ValueChanged<double>? onChanged;
  final ValueChanged<double>? onChangeEnd;

  double _snap(double next) {
    final clamped = next.clamp(min, max);
    final steps = divisions;
    return steps == null
        ? clamped
        : min +
              ((clamped - min) / (max - min) * steps).round() /
                  steps *
                  (max - min);
  }

  @override
  Widget build(BuildContext context) {
    final c = AppTokens.of(context).colorScheme;
    final fraction = ((value - min) / (max - min)).clamp(0.0, 1.0);
    final rtl = Directionality.of(context) == TextDirection.rtl;
    final step = (max - min) / (divisions ?? 20);
    void adjust(double delta) {
      final next = _snap(value + delta);
      onChanged?.call(next);
      onChangeEnd?.call(next);
    }

    var lastValue = value;
    void update(Offset position, double width) {
      final fraction = ((position.dx - 10) / (width - 20)).clamp(0.0, 1.0);
      lastValue = _snap(min + (rtl ? 1 - fraction : fraction) * (max - min));
      onChanged?.call(lastValue);
    }

    return Semantics(
      slider: true,
      label: label,
      value: '${(fraction * 100).round()}%',
      increasedValue:
          '${((_snap(value + step) - min) / (max - min) * 100).round()}%',
      decreasedValue:
          '${((_snap(value - step) - min) / (max - min) * 100).round()}%',
      onIncrease: onChanged == null ? null : () => adjust(step),
      onDecrease: onChanged == null ? null : () => adjust(-step),
      child: FocusableActionDetector(
        enabled: onChanged != null,
        shortcuts: const {
          SingleActivator(LogicalKeyboardKey.arrowRight):
              DirectionalFocusIntent(TraversalDirection.right),
          SingleActivator(LogicalKeyboardKey.arrowLeft): DirectionalFocusIntent(
            TraversalDirection.left,
          ),
        },
        actions: {
          DirectionalFocusIntent: CallbackAction<DirectionalFocusIntent>(
            onInvoke: (intent) {
              adjust(
                (intent.direction == TraversalDirection.right) != rtl
                    ? step
                    : -step,
              );
              return null;
            },
          ),
        },
        child: LayoutBuilder(
          builder: (context, constraints) {
            final width = constraints.maxWidth;

            return GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTapDown: onChanged == null
                  ? null
                  : (event) => update(event.localPosition, width),
              onTapUp: onChanged == null
                  ? null
                  : (event) => onChangeEnd?.call(lastValue),
              onHorizontalDragUpdate: onChanged == null
                  ? null
                  : (event) => update(event.localPosition, width),
              onHorizontalDragEnd: onChanged == null
                  ? null
                  : (_) => onChangeEnd?.call(lastValue),
              child: SizedBox(
                height: 48,
                child: Stack(
                  alignment: Alignment.center,
                  children: [
                    Positioned(
                      left: 10,
                      right: 10,
                      child: Container(
                        height: 4,
                        decoration: BoxDecoration(
                          color: c.input,
                          borderRadius: BorderRadius.circular(2),
                        ),
                      ),
                    ),
                    Positioned(
                      left: 10,
                      right: 10,
                      child: Align(
                        alignment: AlignmentDirectional.centerStart,
                        child: FractionallySizedBox(
                          widthFactor: fraction,
                          child: Container(
                            height: 4,
                            decoration: BoxDecoration(
                              color: onChanged == null
                                  ? c.mutedForeground
                                  : c.primary,
                              borderRadius: BorderRadius.circular(2),
                            ),
                          ),
                        ),
                      ),
                    ),
                    Positioned(
                      left: (width - 20) * (rtl ? 1 - fraction : fraction),
                      child: Container(
                        width: 20,
                        height: 20,
                        decoration: BoxDecoration(
                          color: c.card,
                          shape: BoxShape.circle,
                          border: Border.all(
                            color: onChanged == null
                                ? c.mutedForeground
                                : c.primary,
                            width: 3,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}
