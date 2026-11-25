import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/features/assistant/widgets/assistant_empty_hero.dart';
import 'package:mobile/features/assistant/widgets/assistant_quick_actions.dart';

/// The new-chat screen: greeting, quick actions and, when given, the recent
/// conversations, centred in the space above the composer.
class AssistantHomeView extends StatelessWidget {
  const AssistantHomeView({
    required this.assistantName,
    required this.onPromptSelected,
    required this.availableHeight,
    this.recent,
    this.thinking = false,
    this.listening = false,
    this.now,
    super.key,
  });

  /// Widest the home content grows, so tiles stay readable on desktop.
  static const double maxWidth = 640;

  /// Available heights below which the home tightens (phones) and shrinks
  /// its character further (small phones and short windows).
  static const double compactHeight = 680;
  static const double tinyHeight = 440;

  final String assistantName;
  final ValueChanged<String> onPromptSelected;

  /// Height between the header and the composer that the home centres in.
  final double availableHeight;

  /// Recent conversations; null where the history sidebar already shows them.
  final Widget? recent;
  final bool thinking;
  final bool listening;
  final DateTime? now;

  @override
  Widget build(BuildContext context) {
    // A short space above the composer gets a smaller character and tighter
    // gaps so the greeting, quick actions and recent chats fit in it.
    final compact = availableHeight < compactHeight;
    return Center(
      key: const ValueKey('assistant-home'),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: maxWidth),
        child: Padding(
          padding: EdgeInsets.symmetric(vertical: compact ? 0 : AppSpacing.lg),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              AssistantEmptyHero(
                assistantName: assistantName,
                thinking: thinking,
                listening: listening,
                now: now,
                characterSize: availableHeight < tinyHeight
                    ? 56
                    : compact
                    ? 64
                    : 104,
                dense: compact,
              ),
              SizedBox(height: compact ? AppSpacing.md : AppSpacing.xl),
              AssistantQuickActionGrid(onSelected: onPromptSelected),
              if (recent case final recent?) ...[
                SizedBox(height: compact ? AppSpacing.lg : AppSpacing.xxl),
                recent,
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// Places the home from [builder] between the header and the composer,
/// centred when it fits and scrolling when it does not.
///
/// The home lays out with plain box constraints rather than the intrinsic
/// sizing `SliverFillRemaining` relies on, so width-aware children such as
/// the quick-action grid can use `LayoutBuilder`.
class SliverAssistantHome extends StatelessWidget {
  const SliverAssistantHome({
    required this.builder,
    this.bottomReserve = 0,
    super.key,
  });

  /// Builds the home for the height left between the header and composer.
  final Widget Function(BuildContext context, double availableHeight) builder;

  /// Space at the bottom of the viewport already covered by the composer.
  final double bottomReserve;

  @override
  Widget build(BuildContext context) => SliverLayoutBuilder(
    builder: (context, constraints) {
      final extent = math
          .max(
            0,
            constraints.viewportMainAxisExtent -
                constraints.precedingScrollExtent -
                bottomReserve,
          )
          .toDouble();
      return SliverToBoxAdapter(
        child: ConstrainedBox(
          constraints: BoxConstraints(minHeight: extent),
          child: Center(child: builder(context, extent)),
        ),
      );
    },
  );
}
