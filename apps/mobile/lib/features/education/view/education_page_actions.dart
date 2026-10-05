part of 'education_page.dart';

extension _EducationPageActions on _EducationPageState {
  String _createTooltip(AppLocalizations l10n) {
    if (_tab == _EducationTab.courses) return l10n.educationCreateCourse;
    return switch (_libraryTab) {
      _EducationLibraryTab.quizzes => l10n.educationCreateQuiz,
      _EducationLibraryTab.quizSets => l10n.educationCreateQuizSet,
      _EducationLibraryTab.flashcards => l10n.educationCreateFlashcard,
    };
  }

  Future<void> _showCreateSheet() async {
    switch (_tab) {
      case _EducationTab.courses:
        return await _showCourseSheet();
      case _EducationTab.library:
        switch (_libraryTab) {
          case _EducationLibraryTab.quizzes:
            return await _showQuizSheet();
          case _EducationLibraryTab.quizSets:
            return await _showQuizSetSheet();
          case _EducationLibraryTab.flashcards:
            return await _showFlashcardSheet();
        }
      case _EducationTab.overview:
      case _EducationTab.attempts:
        return;
    }
  }

  Future<void> _showCourseSheet({EducationCourse? course}) async {
    final wsId = _wsId;
    if (wsId.isEmpty) return;
    final result = await _showOwnedSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (context) => _CourseSheet(
        title: course == null
            ? context.l10n.educationCreateCourse
            : context.l10n.educationEditCourse,
        initialName: course?.name,
        initialDescription: course?.description,
        onSubmit: (name, description) async {
          if (course == null) {
            await _repository.createCourse(
              wsId,
              name: name,
              description: description,
            );
          } else {
            await _repository.updateCourse(
              wsId,
              course.id,
              name: name,
              description: description,
            );
          }
        },
      ),
    );
    if (result == true && mounted) {
      await _loadCourses();
    }
  }

  Future<void> _showQuizSetSheet({EducationQuizSet? quizSet}) async {
    final wsId = _wsId;
    if (wsId.isEmpty) return;
    final result = await _showOwnedSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (context) => _SimpleEducationSheet(
        title: quizSet == null
            ? context.l10n.educationCreateQuizSet
            : context.l10n.educationEditQuizSet,
        fieldLabel: context.l10n.educationQuizSetNameLabel,
        initialValue: quizSet?.name,
        onSubmit: (value, _) async {
          if (quizSet == null) {
            await _repository.createQuizSet(wsId, name: value);
          } else {
            await _repository.updateQuizSet(wsId, quizSet.id, name: value);
          }
        },
      ),
    );
    if (result == true && mounted) {
      await _loadLibrary();
    }
  }

  Future<void> _showFlashcardSheet({EducationFlashcard? flashcard}) async {
    final wsId = _wsId;
    if (wsId.isEmpty) return;
    final result = await _showOwnedSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (context) => _SimpleEducationSheet(
        title: flashcard == null
            ? context.l10n.educationCreateFlashcard
            : context.l10n.educationEditFlashcard,
        fieldLabel: context.l10n.educationFlashcardFrontLabel,
        secondaryLabel: context.l10n.educationFlashcardBackLabel,
        initialValue: flashcard?.front,
        initialSecondaryValue: flashcard?.back,
        onSubmit: (front, back) async {
          if (flashcard == null) {
            await _repository.createFlashcard(wsId, front: front, back: back);
          } else {
            await _repository.updateFlashcard(
              wsId,
              flashcard.id,
              front: front,
              back: back,
            );
          }
        },
      ),
    );
    if (result == true && mounted) {
      await _loadLibrary();
    }
  }

  Future<void> _showQuizSheet({EducationQuiz? quiz}) async {
    final wsId = _wsId;
    if (wsId.isEmpty) return;
    final result = await _showOwnedSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (context) => _QuizSheet(
        title: quiz == null
            ? context.l10n.educationCreateQuiz
            : context.l10n.educationEditQuiz,
        initialQuiz: quiz,
        onSubmit: (question, options) async {
          if (quiz == null) {
            await _repository.createQuiz(
              wsId,
              question: question,
              options: options,
            );
          } else {
            await _repository.updateQuiz(
              wsId,
              quiz.id,
              question: question,
              options: options,
            );
          }
        },
      ),
    );
    if (result == true && mounted) {
      await _loadLibrary();
    }
  }

  Future<void> _confirmDelete({
    required String title,
    required Future<void> Function() onDelete,
  }) async {
    final confirmed = await _showOwnedDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(context.l10n.commonDelete),
        content: Text(title),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: Text(context.l10n.commonCancel),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: Text(context.l10n.commonDelete),
          ),
        ],
      ),
    );

    if (confirmed != true) return;
    await onDelete();
    if (!mounted) return;
    await _reloadCurrentTab();
  }

  Future<void> _showAttemptsFilterSheet() async {
    final result = await _showOwnedSheet<Map<String, String?>>(
      context: context,
      isScrollControlled: true,
      builder: (context) => _AttemptsFilterSheet(
        sets: _attemptSets,
        selectedSetId: _attemptSetId,
        selectedStatus: _attemptStatus,
      ),
    );

    if (result == null) return;
    _updateState(() {
      _attemptSetId = result['setId'];
      _attemptStatus = result['status'] ?? 'all';
    });
    await _loadAttempts();
  }

  Future<void> _openAttemptDetail(EducationAttemptSummary attempt) async {
    final wsId = _wsId;
    if (wsId.isEmpty) return;
    if (!mounted) return;

    await _showOwnedSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (context) => FractionallySizedBox(
        heightFactor: 0.86,
        child: _EducationAttemptReader(
          repository: _repository,
          workspaceId: wsId,
          attemptId: attempt.id,
        ),
      ),
    );
  }

  int get _activeAttemptFilterCount {
    var count = 0;
    if (_attemptStatus != 'all') count += 1;
    if (_attemptSetId != null && _attemptSetId!.isNotEmpty) count += 1;
    return count;
  }
}
