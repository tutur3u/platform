import 'package:flutter/material.dart';
import 'package:mobile/core/responsive/responsive_padding.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class OnboardingChoiceSlide extends StatelessWidget {
  const OnboardingChoiceSlide({
    required this.title,
    required this.subtitle,
    required this.options,
    required this.selected,
    required this.onToggle,
    super.key,
  });

  final String title;
  final String subtitle;
  final List<String> options;
  final Set<int> selected;
  final ValueChanged<int> onToggle;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final hPadding = ResponsivePadding.horizontal(context.deviceClass);

    return SingleChildScrollView(
      padding: EdgeInsets.symmetric(horizontal: hPadding, vertical: 24),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const shad.Gap(32),
          Text(
            title,
            style: theme.typography.h2.copyWith(fontWeight: FontWeight.bold),
            textAlign: TextAlign.center,
          ),
          const shad.Gap(12),
          Text(
            subtitle,
            style: theme.typography.lead.copyWith(
              color: theme.colorScheme.mutedForeground,
            ),
            textAlign: TextAlign.center,
          ),
          const shad.Gap(28),
          Wrap(
            alignment: WrapAlignment.center,
            spacing: 10,
            runSpacing: 10,
            children: List.generate(options.length, (index) {
              final active = selected.contains(index);
              return ChoiceChip(
                label: Text(options[index]),
                selected: active,
                onSelected: (_) => onToggle(index),
                avatar: active ? const Icon(Icons.check, size: 16) : null,
              );
            }),
          ),
        ],
      ),
    );
  }
}
