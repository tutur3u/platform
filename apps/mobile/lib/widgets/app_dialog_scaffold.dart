import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class AppDialogScaffold extends StatelessWidget {
  const AppDialogScaffold({
    required this.title,
    required this.child,
    this.description,
    this.icon,
    this.actions = const [],
    this.headerTrailing,
    this.padding = const EdgeInsets.fromLTRB(20, 20, 20, 20),
    this.maxWidth = 560,
    this.maxHeightFactor = 0.88,
    this.scrollable = true,
    super.key,
  });

  final String title;
  final String? description;
  final IconData? icon;
  final Widget child;
  final List<Widget> actions;
  final Widget? headerTrailing;
  final EdgeInsetsGeometry padding;
  final double maxWidth;
  final double maxHeightFactor;
  final bool scrollable;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final isCompact = context.isCompact;
    final mediaQuery = MediaQuery.of(context);
    final viewInsets = mediaQuery.viewInsets;
    final body = scrollable
        ? SingleChildScrollView(
            padding: padding,
            child: child,
          )
        : Padding(
            padding: padding,
            child: child,
          );

    return SafeArea(
      top: false,
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          isCompact ? 12 : 20,
          isCompact ? 12 : 20,
          isCompact ? 12 : 20,
          math.max(isCompact ? 12 : 20, viewInsets.bottom + 12),
        ),
        child: Align(
          alignment: isCompact ? Alignment.bottomCenter : Alignment.center,
          child: ConstrainedBox(
            constraints: BoxConstraints(
              maxWidth: maxWidth,
              maxHeight: mediaQuery.size.height * maxHeightFactor,
            ),
            child: DecoratedBox(
              decoration: BoxDecoration(
                color: theme.colorScheme.background,
                borderRadius: BorderRadius.circular(isCompact ? 28 : 24),
                border: Border.all(
                  color: theme.colorScheme.border.withValues(alpha: 0.7),
                ),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.18),
                    blurRadius: 28,
                    offset: const Offset(0, 18),
                  ),
                ],
              ),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(isCompact ? 28 : 24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (isCompact) ...[
                      const shad.Gap(10),
                      Container(
                        width: 52,
                        height: 5,
                        decoration: BoxDecoration(
                          color: theme.colorScheme.mutedForeground.withValues(
                            alpha: 0.24,
                          ),
                          borderRadius: BorderRadius.circular(999),
                        ),
                      ),
                    ],
                    Padding(
                      padding: EdgeInsets.fromLTRB(
                        20,
                        isCompact ? 18 : 20,
                        20,
                        0,
                      ),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          if (icon != null) ...[
                            Container(
                              width: 40,
                              height: 40,
                              decoration: BoxDecoration(
                                color: theme.colorScheme.primary.withValues(
                                  alpha: 0.10,
                                ),
                                borderRadius: BorderRadius.circular(14),
                              ),
                              child: Icon(
                                icon,
                                color: theme.colorScheme.primary,
                                size: 20,
                              ),
                            ),
                            const shad.Gap(12),
                          ],
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  title,
                                  style: theme.typography.h4.copyWith(
                                    fontWeight: FontWeight.w800,
                                  ),
                                ),
                                if (description?.trim().isNotEmpty ??
                                    false) ...[
                                  const shad.Gap(6),
                                  Text(
                                    description!,
                                    style: theme.typography.textSmall.copyWith(
                                      color: theme.colorScheme.mutedForeground,
                                    ),
                                  ),
                                ],
                              ],
                            ),
                          ),
                          if (headerTrailing != null) ...[
                            const shad.Gap(12),
                            headerTrailing!,
                          ],
                        ],
                      ),
                    ),
                    const shad.Gap(18),
                    Flexible(child: body),
                    if (actions.isNotEmpty)
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.fromLTRB(20, 14, 20, 20),
                        decoration: BoxDecoration(
                          color: theme.colorScheme.card.withValues(alpha: 0.78),
                          border: Border(
                            top: BorderSide(
                              color: theme.colorScheme.border.withValues(
                                alpha: 0.8,
                              ),
                            ),
                          ),
                        ),
                        child: Wrap(
                          alignment: WrapAlignment.end,
                          spacing: 10,
                          runSpacing: 10,
                          children: actions,
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
