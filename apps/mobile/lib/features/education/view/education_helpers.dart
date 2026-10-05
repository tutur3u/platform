part of 'education_page.dart';

class _QuizOptionDraft {
  _QuizOptionDraft({
    required this.controller,
    required this.explanationController,
    required this.isCorrect,
    this.id,
  });

  factory _QuizOptionDraft.empty({bool correct = false}) {
    return _QuizOptionDraft(
      controller: TextEditingController(),
      explanationController: TextEditingController(),
      isCorrect: correct,
    );
  }

  factory _QuizOptionDraft.fromOption(EducationQuizOption option) {
    return _QuizOptionDraft(
      id: option.id,
      controller: TextEditingController(text: option.value),
      explanationController: TextEditingController(text: option.explanation),
      isCorrect: option.isCorrect,
    );
  }

  final String? id;
  final TextEditingController controller;
  final TextEditingController explanationController;
  bool isCorrect;

  void dispose() {
    controller.dispose();
    explanationController.dispose();
  }
}

String _formatDuration(int seconds) {
  final duration = Duration(seconds: seconds);
  if (duration.inHours > 0) {
    return '${duration.inHours}h ${duration.inMinutes.remainder(60)}m';
  }
  if (duration.inMinutes > 0) {
    return '${duration.inMinutes}m';
  }
  return '${duration.inSeconds}s';
}

List<T> _mergeEducation<T>(List<T> old, List<T> next, String Function(T) id) =>
    <String, T>{
      for (final row in old) id(row): row,
      for (final row in next) id(row): row,
    }.values.toList(growable: false);

extension _EducationFailures on _EducationPageState {
  void _handleLoadFailure(Object error) {
    final denied = _educationAccessDenied(error);
    _updateState(() {
      _pagingFailed = true;
      _error = context.l10n.commonSomethingWentWrong;
      if (denied) {
        _coursePreview = const [];
        _courses = const [];
        _coursesCount = 0;
        _courseSummaryCount = 0;
        _quizzes = const [];
        _quizzesCount = 0;
        _quizSummaryCount = 0;
        _quizSets = const [];
        _quizSetsCount = 0;
        _quizSetSummaryCount = 0;
        _flashcards = const [];
        _flashcardsCount = 0;
        _flashcardSummaryCount = 0;
        _attemptPreview = const [];
        _attempts = const [];
        _attemptsCount = 0;
        _attemptSummaryCount = 0;
        _attemptSets = const [];
      }
    });
  }
}

bool _educationAccessDenied(Object error) =>
    error is ApiException &&
    (error.statusCode == 401 ||
        (error.statusCode == 403 &&
            error.code != 'MFA_REQUIRED' &&
            !error.isVerificationRequired));
