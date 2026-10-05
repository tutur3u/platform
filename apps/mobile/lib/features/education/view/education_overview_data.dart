part of 'education_page.dart';

extension _EducationOverviewData on _EducationPageState {
  Future<void> _loadOverview() async {
    if (_wsId.isEmpty) return;
    final token = ++_requestToken;
    _updateState(() {
      _isLoading = true;
      _error = null;
    });
    Future<void> source<T>(
      Future<T> Function() read,
      void Function(T) publish,
      VoidCallback clear,
    ) async {
      try {
        final value = await read();
        if (!mounted || token != _requestToken) return;
        _updateState(() {
          publish(value);
          // An optional source must not hold usable content behind a skeleton.
          _isLoading = false;
        });
      } on Object catch (error) {
        if (!mounted || token != _requestToken) return;
        if (error is ApiException && error.statusCode == 401) {
          _requestToken++;
          _handleLoadFailure(error);
          _updateState(() => _isLoading = false);
          return;
        }
        _updateState(() {
          _error = context.l10n.commonSomethingWentWrong;
          if (_educationAccessDenied(error)) clear();
        });
      }
    }

    await Future.wait([
      source(
        () => _repository.getCourses(_wsId, pageSize: 3),
        (value) {
          _coursePreview = value.items;
          _courseSummaryCount = value.count;
        },
        () {
          _coursePreview = const [];
          _courses = const [];
          _coursesCount = 0;
          _courseSummaryCount = 0;
        },
      ),
      source(
        () => _repository.getQuizzes(_wsId, pageSize: 3),
        (value) => _quizSummaryCount = value.count,
        () {
          _quizzes = const [];
          _quizzesCount = 0;
          _quizSummaryCount = 0;
        },
      ),
      source(
        () => _repository.getQuizSets(_wsId, pageSize: 3),
        (value) => _quizSetSummaryCount = value.count,
        () {
          _quizSets = const [];
          _quizSetsCount = 0;
          _quizSetSummaryCount = 0;
        },
      ),
      source(
        () => _repository.getFlashcards(_wsId, pageSize: 3),
        (value) => _flashcardSummaryCount = value.count,
        () {
          _flashcards = const [];
          _flashcardsCount = 0;
          _flashcardSummaryCount = 0;
        },
      ),
      source(
        () => _repository.getAttempts(
          _wsId,
          pageSize: 3,
          status: _attemptStatus,
          setId: _attemptSetId,
        ),
        (value) {
          _attemptPreview = value.attempts;
          _attemptSummaryCount = value.count;
          _attemptSets = value.sets;
        },
        () {
          _attemptPreview = const [];
          _attempts = const [];
          _attemptsCount = 0;
          _attemptSummaryCount = 0;
          _attemptSets = const [];
        },
      ),
    ]);
    if (mounted && token == _requestToken) {
      _updateState(() {
        _isLoading = false;
        _isLoadingMore = false;
      });
    }
  }
}
