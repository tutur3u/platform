import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/interaction/app_haptics.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/mastermind/fleet/view/detail/fleet_option_card.dart';
import 'package:mobile/l10n/l10n.dart';

export 'package:mobile/features/mastermind/fleet/view/detail/fleet_option_card.dart';

/// A decision's choices as swipeable cards, in their canonical order (the
/// recommended one is marked, never moved). Choose turns that card's slot
/// into Cancel and Send in place; swiping away cancels. [onSend] fires on
/// Send, or at once for a choice that asks for written notes.
///
/// Every card shares the tallest card's height, so swiping never resizes
/// the carousel. With [lockedKey] the decision is already answered: that
/// choice shows [lockedState] and the rest have no actions.
class FleetOptionCarousel extends StatefulWidget {
  const FleetOptionCarousel({
    required this.choices,
    required this.orchestrator,
    required this.onSend,
    this.lockedKey,
    this.lockedState = FleetChoiceSlotState.sent,
    this.onRetry,
    super.key,
  });

  final List<FleetChoice> choices;
  final String orchestrator;
  final ValueChanged<FleetChoice> onSend;
  final String? lockedKey;
  final FleetChoiceSlotState lockedState;
  final VoidCallback? onRetry;

  static const double viewportFraction = 0.9;

  @override
  State<FleetOptionCarousel> createState() => _FleetOptionCarouselState();
}

class _FleetOptionCarouselState extends State<FleetOptionCarousel> {
  late final PageController _pages = PageController(
    viewportFraction: FleetOptionCarousel.viewportFraction,
    initialPage: _initialPage,
  );
  late int _page = _initialPage;
  String? _confirming;

  int get _initialPage {
    final locked = widget.choices.indexWhere((c) => c.key == widget.lockedKey);
    return locked < 0 ? 0 : locked;
  }

  @override
  void dispose() {
    _pages.dispose();
    super.dispose();
  }

  FleetChoiceSlotState _state(FleetChoice choice) {
    if (widget.lockedKey != null) {
      return choice.key == widget.lockedKey
          ? widget.lockedState
          : FleetChoiceSlotState.none;
    }
    return _confirming == choice.key
        ? FleetChoiceSlotState.confirm
        : FleetChoiceSlotState.idle;
  }

  void _choose(FleetChoice choice) {
    unawaited(AppHaptics.selection());
    if (choice.needsText) {
      widget.onSend(choice);
      return;
    }
    setState(() => _confirming = choice.key);
  }

  void _send(FleetChoice choice) {
    setState(() => _confirming = null);
    widget.onSend(choice);
  }

  Widget _card(FleetChoice choice, {required bool fill}) => FleetOptionCard(
    choice: choice,
    fill: fill,
    slot: FleetChoiceSlot(
      state: _state(choice),
      orchestrator: widget.orchestrator,
      recommended: choice.recommended,
      onChoose: () => _choose(choice),
      onCancel: () => setState(() => _confirming = null),
      onSend: () => _send(choice),
      onRetry: widget.onRetry,
    ),
  );

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    final choices = widget.choices;
    if (choices.isEmpty) return const SizedBox.shrink();
    final overline = tokens.typography.overline.copyWith(
      color: tokens.colorScheme.mutedForeground,
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                l10n.mastermindFleetYourOptions.toUpperCase(),
                style: overline,
              ),
            ),
            if (choices.length > 1)
              Text(
                l10n.mastermindFleetPosition(_page + 1, choices.length),
                style: overline,
              ),
          ],
        ),
        const SizedBox(height: AppSpacing.sm),
        LayoutBuilder(
          builder: (context, constraints) {
            final page =
                constraints.maxWidth * FleetOptionCarousel.viewportFraction;
            const gap = AppSpacing.sm;
            return Stack(
              children: [
                // Every card laid out at page width but never shown: an
                // IndexedStack sizes to its tallest child and paints, hit
                // tests and exposes only the empty first one.
                IndexedStack(
                  children: [
                    const SizedBox.shrink(),
                    for (final choice in choices)
                      SizedBox(
                        width: page - gap,
                        child: _card(choice, fill: false),
                      ),
                  ],
                ),
                Positioned.fill(
                  child: PageView.builder(
                    controller: _pages,
                    padEnds: false,
                    itemCount: choices.length,
                    onPageChanged: (index) => setState(() {
                      _page = index;
                      _confirming = null;
                    }),
                    itemBuilder: (context, index) => Padding(
                      padding: const EdgeInsets.only(right: gap),
                      child: _card(choices[index], fill: true),
                    ),
                  ),
                ),
              ],
            );
          },
        ),
        if (choices.length > 1) ...[
          const SizedBox(height: AppSpacing.sm),
          ExcludeSemantics(
            child: _Dots(count: choices.length, page: _page),
          ),
        ],
      ],
    );
  }
}

class _Dots extends StatelessWidget {
  const _Dots({required this.count, required this.page});

  final int count;
  final int page;

  @override
  Widget build(BuildContext context) {
    final colors = AppTokens.of(context).colorScheme;
    final reduced = MediaQuery.disableAnimationsOf(context);
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        for (var i = 0; i < count; i++)
          AnimatedContainer(
            duration: reduced
                ? Duration.zero
                : const Duration(milliseconds: 180),
            margin: const EdgeInsets.symmetric(horizontal: AppSpacing.xxs),
            width: i == page ? 18 : 6,
            height: 6,
            decoration: BoxDecoration(
              color: i == page ? colors.foreground : colors.border,
              borderRadius: BorderRadius.circular(3),
            ),
          ),
      ],
    );
  }
}
