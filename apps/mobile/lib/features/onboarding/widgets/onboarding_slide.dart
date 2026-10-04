import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:mobile/core/responsive/responsive_padding.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class OnboardingSlide extends StatelessWidget {
  const OnboardingSlide({
    required this.title,
    required this.subtitle,
    required this.icon,
    this.accentColor,
    this.toolkit = false,
    super.key,
  });

  final String title;
  final String subtitle;
  final IconData icon;
  final Color? accentColor;
  final bool toolkit;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final l10n = context.l10n;
    return SingleChildScrollView(
      padding: EdgeInsets.symmetric(
        horizontal: ResponsivePadding.horizontal(context.deviceClass),
        vertical: 24,
      ),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 560),
          child: Column(
            children: [
              Text(
                title,
                style: theme.typography.h1.copyWith(
                  fontWeight: FontWeight.w800,
                  letterSpacing: -1.2,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 16),
              Text(
                subtitle,
                style: theme.typography.large.copyWith(
                  color: theme.colorScheme.mutedForeground,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 28),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(24),
                decoration: BoxDecoration(
                  color: theme.colorScheme.card,
                  borderRadius: BorderRadius.circular(28),
                  border: Border.all(color: theme.colorScheme.border),
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [
                      (accentColor ?? const Color(0xFF4285F4)).withValues(
                        alpha: .13,
                      ),
                      theme.colorScheme.card,
                      const Color(0xFF34A853).withValues(alpha: .09),
                    ],
                  ),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Image.asset(
                          'assets/logos/nova-transparent.png',
                          height: 44,
                          width: 44,
                          excludeFromSemantics: true,
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            l10n.connectedOnboardingMiraTitle,
                            style: theme.typography.h3,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),
                    Text(
                      toolkit
                          ? l10n.connectedOnboardingMiraToolkit
                          : l10n.connectedOnboardingMiraSubtitle,
                      style: theme.typography.base,
                    ),
                    const SizedBox(height: 24),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        _Tool(
                          icon: LucideIcons.listTodo,
                          title: l10n.tasksTitle,
                        ),
                        _Tool(
                          icon: LucideIcons.calendar,
                          title: l10n.calendarTitle,
                        ),
                        _Tool(
                          icon: LucideIcons.wallet,
                          title: l10n.financeTitle,
                        ),
                        _Tool(
                          icon: LucideIcons.package,
                          title: l10n.inventoryTitle,
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 20),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                    icon,
                    size: 18,
                    color: theme.colorScheme.mutedForeground,
                  ),
                  const SizedBox(width: 8),
                  Flexible(
                    child: Text(
                      l10n.connectedOnboardingOptional,
                      style: theme.typography.small.copyWith(
                        color: theme.colorScheme.mutedForeground,
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Tool extends StatelessWidget {
  const _Tool({required this.icon, required this.title});
  final IconData icon;
  final String title;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
      decoration: BoxDecoration(
        color: theme.colorScheme.background,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: theme.colorScheme.border),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 16),
          const SizedBox(width: 8),
          Flexible(child: Text(title, style: theme.typography.small)),
        ],
      ),
    );
  }
}
