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
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 560),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const shad.Gap(8),
              Text(
                title,
                style: theme.typography.h2.copyWith(
                  fontWeight: FontWeight.bold,
                ),
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
              ...List.generate(options.length, (index) {
                final active = selected.contains(index);
                return Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: Semantics(
                    selected: active,
                    child: Material(
                      color: active
                          ? theme.colorScheme.primary.withValues(alpha: .1)
                          : theme.colorScheme.card,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(18),
                        side: BorderSide(
                          color: active
                              ? theme.colorScheme.primary
                              : theme.colorScheme.border,
                        ),
                      ),
                      clipBehavior: Clip.antiAlias,
                      child: InkWell(
                        onTap: () => onToggle(index),
                        child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: Row(
                            children: [
                              Icon(
                                active
                                    ? Icons.check_circle_outline
                                    : Icons.circle_outlined,
                                size: 22,
                              ),
                              const SizedBox(width: 14),
                              Expanded(
                                child: Text(
                                  options[index],
                                  style: theme.typography.base.copyWith(
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                );
              }),
            ],
          ),
        ),
      ),
    );
  }
}
