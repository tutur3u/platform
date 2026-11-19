import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart' hide AppLayout, AppRadius, AppSpacing;
import 'package:mobile/data/models/education/education_models.dart';
import 'package:mobile/l10n/l10n.dart';

/// Flip through flashcards already stored for the workspace.
class EducationFlashcardStudy extends StatefulWidget {
  const EducationFlashcardStudy({required this.loadCards, super.key});

  final Future<List<EducationFlashcard>> Function() loadCards;

  @override
  State<EducationFlashcardStudy> createState() =>
      _EducationFlashcardStudyState();
}

class _EducationFlashcardStudyState extends State<EducationFlashcardStudy> {
  List<EducationFlashcard>? _cards;
  Object? _error;
  var _index = 0;
  var _showBack = false;

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final cards = await widget.loadCards();
      if (!mounted) return;
      setState(() => _cards = cards);
    } on Object {
      if (!mounted) return;
      setState(() => _error = StateError('load'));
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final cards = _cards;
    return AppSheetScaffold(
      title: l10n.educationLibraryFlashcardsLabel,
      child: cards == null
          ? _error == null
                ? const AppLoadingIndicator.page()
                : AppStateMessage(
                    icon: AppIcons.error,
                    tone: AppTone.destructive,
                    title: l10n.commonSomethingWentWrong,
                    actionLabel: l10n.commonRetry,
                    onAction: _load,
                  )
          : cards.isEmpty
          ? AppStateMessage(
              icon: LucideIcons.layers,
              title: l10n.educationLibraryFlashcardsLabel,
              message: l10n.educationEmptyFlashcards,
            )
          : _CardFace(
              card: cards[_index],
              position: l10n.educationQuizScore(_index + 1, cards.length),
              showBack: _showBack,
              onFlip: () => setState(() => _showBack = !_showBack),
              onNext: _index + 1 >= cards.length
                  ? null
                  : () => setState(() {
                      _index += 1;
                      _showBack = false;
                    }),
            ),
    );
  }
}

class _CardFace extends StatelessWidget {
  const _CardFace({
    required this.card,
    required this.position,
    required this.showBack,
    required this.onFlip,
    required this.onNext,
  });

  final EducationFlashcard card;
  final String position;
  final bool showBack;
  final VoidCallback onFlip;
  final VoidCallback? onNext;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final face = showBack ? card.back : card.front;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          position,
          style: AppTokens.of(context).typography.small.copyWith(
            color: AppTokens.of(context).colorScheme.mutedForeground,
          ),
        ),
        const SizedBox(height: AppSpacing.md),
        AppPanel(
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 160),
            child: Align(
              alignment: Alignment.centerLeft,
              child: Text(
                face.isEmpty ? l10n.educationEmptyFlashcards : face,
                style: AppTokens.of(context).typography.large,
              ),
            ),
          ),
        ),
        const SizedBox(height: AppSpacing.lg),
        AppButton.secondary(
          onPressed: onFlip,
          child: Text(
            showBack
                ? l10n.educationFlashcardShowPrompt
                : l10n.educationFlashcardShowAnswer,
          ),
        ),
        if (onNext != null) ...[
          const SizedBox(height: AppSpacing.sm),
          AppButton.primary(onPressed: onNext, child: Text(l10n.commonNext)),
        ],
      ],
    );
  }
}
