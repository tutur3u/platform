import 'package:flutter/material.dart';
import 'package:mobile/core/theme/sorbet/sorbet_palettes.dart';
import 'package:mobile/core/theme/sorbet/sorbet_preferences.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/settings/view/appearance/appearance_labels.dart';
import 'package:mobile/l10n/l10n.dart';

/// One swatch per Sorbet preset: its accent on its ground.
class AppearanceSorbetPalette extends StatelessWidget {
  const AppearanceSorbetPalette({
    required this.selected,
    required this.brightness,
    required this.onSelected,
    super.key,
  });

  final SorbetPreset selected;
  final Brightness brightness;
  final ValueChanged<SorbetPreset> onSelected;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final scheme = AppTokens.of(context).colorScheme;
    return Wrap(
      spacing: 10,
      runSpacing: 10,
      children: [
        for (final preset in SorbetPreset.values)
          Tooltip(
            message: l10n.sorbetPreset(preset),
            child: Semantics(
              button: true,
              selected: preset == selected,
              label: l10n.sorbetPreset(preset),
              // Excluded child semantics drop the InkResponse tap action.
              onTap: () => onSelected(preset),
              excludeSemantics: true,
              child: InkResponse(
                key: ValueKey('appearance-sorbet-preset-${preset.id}'),
                radius: 26,
                onTap: () => onSelected(preset),
                child: AnimatedContainer(
                  duration: MediaQuery.disableAnimationsOf(context)
                      ? Duration.zero
                      : const Duration(milliseconds: 180),
                  width: 44,
                  height: 44,
                  padding: const EdgeInsets.all(3),
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: preset == selected
                          ? scheme.foreground
                          : scheme.foreground.withValues(alpha: 0),
                      width: 2,
                    ),
                  ),
                  child: _Swatch(preset: preset, brightness: brightness),
                ),
              ),
            ),
          ),
      ],
    );
  }
}

class _Swatch extends StatelessWidget {
  const _Swatch({required this.preset, required this.brightness});

  final SorbetPreset preset;
  final Brightness brightness;

  @override
  Widget build(BuildContext context) {
    final source = SorbetPalettes.source(preset, brightness);
    return DecoratedBox(
      decoration: BoxDecoration(
        color: source.ground,
        shape: BoxShape.circle,
        border: Border.all(color: source.hairline),
      ),
      child: Center(
        child: SizedBox.square(
          dimension: 18,
          child: DecoratedBox(
            decoration: BoxDecoration(
              color: source.accent,
              shape: BoxShape.circle,
            ),
          ),
        ),
      ),
    );
  }
}
