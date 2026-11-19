import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/ui.dart' hide AppLayout, AppRadius, AppSpacing;
import 'package:mobile/data/models/education/education_models.dart';
import 'package:mobile/l10n/l10n.dart';

typedef EducationQuizSubmit =
    Future<EducationQuizSubmission> Function(
      List<EducationQuizAnswer> answers,
      int durationSeconds,
    );

/// Practice that hides correctness until Check. The finished score comes from
/// [submitAttempt] when the page provides one. A null callback keeps the
/// on-device note for callers that cannot reach the server.
class EducationQuizPractice extends StatefulWidget {
  const EducationQuizPractice({
    required this.loadQuizzes,
    this.submitAttempt,
    this.onSubmitted,
    super.key,
  });

  final Future<List<EducationQuiz>> Function() loadQuizzes;
  final EducationQuizSubmit? submitAttempt;
  final VoidCallback? onSubmitted;

  @override
  State<EducationQuizPractice> createState() => _EducationQuizPracticeState();
}

class _EducationQuizPracticeState extends State<EducationQuizPractice> {
  final Stopwatch _elapsed = Stopwatch();
  final List<EducationQuizAnswer> _answers = [];
  List<EducationQuiz>? _quizzes;
  Object? _error;
  var _index = 0;
  var _correct = 0;
  var _scoreCorrect = 0;
  var _scoreTotal = 0;
  String? _selectedId;
  var _checked = false;
  var _finished = false;
  var _saved = false;
  var _submitting = false;
  var _submitFailed = false;

  @override
  void initState() {
    super.initState();
    _elapsed.start();
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
      _answers.add(EducationQuizAnswer(quizId: quiz.id, optionId: selected));
    });
  }

  void _advance() {
    final quizzes = _quizzes;
    if (quizzes == null) return;
    if (_index + 1 >= quizzes.length) {
      unawaited(_finish());
      return;
    }
    setState(() {
      _index += 1;
      _selectedId = null;
      _checked = false;
    });
  }

  Future<void> _finish() async {
    final quizzes = _quizzes;
    final submit = widget.submitAttempt;
    if (quizzes == null) return;
    if (submit == null) {
      setState(() {
        _finished = true;
        _saved = false;
        _scoreCorrect = _correct;
        _scoreTotal = quizzes.length;
        _submitFailed = false;
      });
      return;
    }
    setState(() {
      _submitting = true;
      _submitFailed = false;
    });
    try {
      final elapsed = _elapsed.elapsed.inSeconds;
      final result = await submit(_answers, elapsed > 86400 ? 86400 : elapsed);
      if (!mounted) return;
      setState(() {
        _submitting = false;
        _finished = true;
        _saved = true;
        _scoreCorrect = result.correctCount;
        _scoreTotal = result.questionCount;
      });
      widget.onSubmitted?.call();
    } on Object {
      if (!mounted) return;
      setState(() {
        _submitting = false;
        _submitFailed = true;
      });
    }
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
          : _submitting
          ? const AppLoadingIndicator.page()
          : _submitFailed
          ? AppStateMessage(
              icon: AppIcons.error,
              tone: AppTone.destructive,
              title: l10n.commonSomethingWentWrong,
              actionLabel: l10n.commonRetry,
              onAction: () => unawaited(_finish()),
            )
          : _finished
          ? AppStateMessage(
              icon: AppIcons.success,
              title: l10n.educationQuizScore(_scoreCorrect, _scoreTotal),
              message: _saved
                  ? l10n.educationQuizSaved
                  : l10n.educationQuizLocalNote,
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
