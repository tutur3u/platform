import 'package:flutter/material.dart';
import 'package:mobile/features/settings/view/settings_row_layout.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

Duration _motion(BuildContext context) =>
    MediaQuery.disableAnimationsOf(context)
    ? Duration.zero
    : const Duration(milliseconds: 180);

/// Equal-width segmented choice with an accent-filled selection.
class AppearanceSegmented<T> extends StatelessWidget {
  const AppearanceSegmented({
    required this.values,
    required this.selected,
    required this.label,
    required this.icon,
    required this.onSelected,
    super.key,
  });

  final List<T> values;
  final T selected;
  final String Function(T) label;
  final IconData Function(T) icon;
  final ValueChanged<T> onSelected;

  @override
  Widget build(BuildContext context) {
    final scheme = shad.Theme.of(context).colorScheme;
    final typography = shad.Theme.of(context).typography;
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: ShapeDecoration(
        color: SettingsRowLayout.groupFill(context),
        shape: StadiumBorder(side: BorderSide(color: scheme.border, width: .5)),
      ),
      child: Row(
        children: [
          for (final value in values)
            Expanded(
              child: Semantics(
                button: true,
                selected: value == selected,
                child: GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTap: () => onSelected(value),
                  child: AnimatedContainer(
                    duration: _motion(context),
                    curve: Curves.easeOutCubic,
                    constraints: const BoxConstraints(minHeight: 44),
                    padding: const EdgeInsets.symmetric(horizontal: 6),
                    decoration: ShapeDecoration(
                      color: value == selected
                          ? scheme.primary
                          : scheme.primary.withValues(alpha: 0),
                      shape: const StadiumBorder(),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(
                          icon(value),
                          size: 18,
                          color: value == selected
                              ? scheme.primaryForeground
                              : scheme.foreground,
                        ),
                        const shad.Gap(6),
                        Flexible(
                          child: Text(
                            label(value),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: typography.small.copyWith(
                              fontWeight: FontWeight.w600,
                              color: value == selected
                                  ? scheme.primaryForeground
                                  : scheme.foreground,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
