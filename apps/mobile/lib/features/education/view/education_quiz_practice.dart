import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/ui.dart' hide AppLayout, AppRadius, AppSpacing;
import 'package:mobile/data/models/education/education_models.dart';
import 'package:mobile/l10n/l10n.dart';

/// Local quiz practice. Correctness stays hidden until the learner answers,
/// and the score is not submitted because the API has no attempt-submit route.
class EducationQuizPractice extends StatefulWidget {
  const EducationQuizPractice({required this.loadQuizzes, super.key});

  final Future<List<EducationQuiz>> Function() loadQuizzes;

  @override
  State<EducationQuizPractice> createState() => _EducationQuizPracticeState();
}

class _EducationQuizPracticeState extends State<EducationQuizPractice> {
  List<EducationQuiz>? _quizzes;
  Object? _error;
  var _index = 0;
  var _correct = 0;
  String? _selectedId;
  var _checked = false;
  var _finished = false;

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final quizzes = await widget.loadQuizzes();
      if (!mounted) return;
      setState(() => _quizzes = quizzes);
    } on Object {
      if (!mounted) return;
      setState(() => _error = StateError('load'));
    }
  }

  void _check(EducationQuiz quiz) {
    final selected = _selectedId;
    if (selected == null || _checked) return;
    final correct = quiz.options.any(
      (option) => option.id == selected && option.isCorrect,
    );
    setState(() {
      _checked = true;
      if (correct) _correct += 1;
    });
  }

  void _advance() {
    final quizzes = _quizzes;
    if (quizzes == null) return;
    if (_index + 1 >= quizzes.length) {
      setState(() => _finished = true);
      return;
    }
    setState(() {
      _index += 1;
      _selectedId = null;
      _checked = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final quizzes = _quizzes;
    return AppSheetScaffold(
      title: l10n.educationLibraryQuizzesLabel,
      child: quizzes == null
          ? _error == null
                ? const AppLoadingIndicator.page()
                : AppStateMessage(
                    icon: AppIcons.error,
                    tone: AppTone.destructive,
                    title: l10n.commonSomethingWentWrong,
                    actionLabel: l10n.commonRetry,
                    onAction: _load,
                  )
          : quizzes.isEmpty
          ? AppStateMessage(
              icon: LucideIcons.listChecks,
              title: l10n.educationLibraryQuizzesLabel,
              message: l10n.educationEmptyQuizzes,
            )
          : _finished
          ? AppStateMessage(
              icon: AppIcons.success,
              title: l10n.educationQuizScore(_correct, quizzes.length),
              message: l10n.educationQuizLocalNote,
            )
          : _Question(
              quiz: quizzes[_index],
              position: l10n.educationQuizScore(_index + 1, quizzes.length),
              selectedId: _selectedId,
              checked: _checked,
              onSelect: (id) => setState(() => _selectedId = id),
              onCheck: () => _check(quizzes[_index]),
              onNext: _advance,
            ),
    );
  }
}

class _Question extends StatelessWidget {
  const _Question({
    required this.quiz,
    required this.position,
    required this.selectedId,
    required this.checked,
    required this.onSelect,
    required this.onCheck,
    required this.onNext,
  });

  final EducationQuiz quiz;
  final String position;
  final String? selectedId;
  final bool checked;
  final ValueChanged<String> onSelect;
  final VoidCallback onCheck;
  final VoidCallback onNext;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          position,
          style: AppTokens.of(context).typography.small.copyWith(
            color: AppTokens.of(context).colorScheme.mutedForeground,
          ),
        ),
        const SizedBox(height: AppSpacing.sm),
        Text(quiz.question, style: AppTokens.of(context).typography.large),
        const SizedBox(height: AppSpacing.md),
        for (final option in quiz.options) ...[
          AppOptionTile(
            title: option.value,
            subtitle: !checked
                ? null
                : option.isCorrect
                ? l10n.educationQuizCorrect
                : option.id == selectedId
                ? l10n.educationQuizIncorrect
                : null,
            selected: option.id == selectedId,
            onTap: checked ? null : () => onSelect(option.id),
          ),
          const SizedBox(height: AppSpacing.sm),
        ],
        const SizedBox(height: AppSpacing.sm),
        if (!checked)
          AppButton.primary(
            onPressed: selectedId == null ? null : onCheck,
            child: Text(l10n.educationQuizCheck),
          )
        else
          AppButton.primary(onPressed: onNext, child: Text(l10n.commonNext)),
      ],
    );
  }
}
