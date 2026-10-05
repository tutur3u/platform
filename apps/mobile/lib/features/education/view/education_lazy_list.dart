part of 'education_page.dart';

extension _EducationLazyList on _EducationPageState {
  int get _visibleCount => switch (_tab) {
    _EducationTab.overview => _coursePreview.length + _attemptPreview.length,
    _EducationTab.courses => _courses.length,
    _EducationTab.library => switch (_libraryTab) {
      _EducationLibraryTab.quizzes => _quizzes.length,
      _EducationLibraryTab.quizSets => _quizSets.length,
      _EducationLibraryTab.flashcards => _flashcards.length,
    },
    _EducationTab.attempts => _attempts.length,
  };

  Widget _buildEducationList(BuildContext context) {
    final l10n = context.l10n;
    final headers = _isLoading && _visibleCount == 0
        ? <Widget>[]
        : _tab == _EducationTab.overview
        ? _buildOverview(context)
        : <Widget>[
            if (_tab == _EducationTab.library)
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final section in _EducationLibraryTab.values)
                    _EducationLibraryToggle(
                      label: switch (section) {
                        _EducationLibraryTab.quizzes =>
                          l10n.educationLibraryQuizzesLabel,
                        _EducationLibraryTab.quizSets =>
                          l10n.educationLibraryQuizSetsLabel,
                        _EducationLibraryTab.flashcards =>
                          l10n.educationLibraryFlashcardsLabel,
                      },
                      selected: _libraryTab == section,
                      onTap: () => _selectLibraryTab(section),
                    ),
                ],
              ),
          ];
    final rows = _tab == _EducationTab.overview ? 0 : _visibleCount;
    return NovaRefreshIndicator(
      onRefresh: () => _reloadCurrentTab(force: true),
      child: ListView.builder(
        controller: _scrollController,
        physics: const AlwaysScrollableScrollPhysics(),
        padding: EdgeInsets.fromLTRB(
          16,
          12,
          16,
          40 + MediaQuery.paddingOf(context).bottom,
        ),
        itemCount: headers.length + rows + 1,
        itemBuilder: (context, index) {
          if (index < headers.length) return headers[index];
          if (index < headers.length + rows) {
            return _educationRow(context, index - headers.length);
          }
          if (_isLoading && _visibleCount == 0) {
            return Semantics(
              label: l10n.commonLoading,
              liveRegion: true,
              child: Column(
                children: List.generate(
                  3,
                  (_) => Container(
                    height: 78,
                    margin: const EdgeInsets.only(bottom: 10),
                    decoration: BoxDecoration(
                      color: shad.Theme.of(context).colorScheme.muted,
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                ),
              ),
            );
          }
          if (_error != null) {
            return Center(
              child: TextButton.icon(
                onPressed: _isLoading
                    ? null
                    : () => _reloadCurrentTab(force: true),
                icon: const Icon(Icons.refresh_rounded),
                label: Text(l10n.commonRetry),
              ),
            );
          }
          if (_isLoading || _isLoadingMore) {
            return const Center(child: NovaLoadingIndicator());
          }
          if (rows == 0 && _tab != _EducationTab.overview) {
            return Padding(
              padding: const EdgeInsets.all(24),
              child: Center(
                child: Text(switch (_tab) {
                  _EducationTab.courses => l10n.educationEmptyCourses,
                  _EducationTab.attempts => l10n.educationEmptyAttempts,
                  _ => switch (_libraryTab) {
                    _EducationLibraryTab.quizzes => l10n.educationEmptyQuizzes,
                    _EducationLibraryTab.quizSets =>
                      l10n.educationEmptyQuizSets,
                    _EducationLibraryTab.flashcards =>
                      l10n.educationEmptyFlashcards,
                  },
                }),
              ),
            );
          }
          if (_shouldShowLoadMore) {
            return TextButton(
              onPressed: _loadMore,
              child: Text(l10n.commonLoadMore),
            );
          }
          return const SizedBox(height: 16);
        },
      ),
    );
  }

  Widget _educationRow(BuildContext context, int index) {
    final l10n = context.l10n;
    late String id;
    late Widget child;
    if (_tab == _EducationTab.courses) {
      final course = _courses[index];
      id = course.id;
      child = _CourseCard(
        course: course,
        onEdit: () => _showCourseSheet(course: course),
        onDelete: () => _confirmDelete(
          title: l10n.educationDeleteCourseConfirm(course.name),
          onDelete: () => _repository.deleteCourse(_wsId, course.id),
        ),
      );
    } else if (_tab == _EducationTab.attempts) {
      return _AttemptCard(
        attempt: _attempts[index],
        onTap: () => _openAttemptDetail(_attempts[index]),
      );
    } else {
      switch (_libraryTab) {
        case _EducationLibraryTab.quizzes:
          final quiz = _quizzes[index];
          id = quiz.id;
          child = _QuizCard(
            quiz: quiz,
            onEdit: () => _showQuizSheet(quiz: quiz),
            onDelete: () => _confirmDelete(
              title: l10n.educationDeleteQuizConfirm,
              onDelete: () => _repository.deleteQuiz(_wsId, quiz.id),
            ),
          );
        case _EducationLibraryTab.quizSets:
          final set = _quizSets[index];
          id = set.id;
          child = _QuizSetCard(
            quizSet: set,
            onEdit: () => _showQuizSetSheet(quizSet: set),
            onDelete: () => _confirmDelete(
              title: l10n.educationDeleteQuizSetConfirm(set.name),
              onDelete: () => _repository.deleteQuizSet(_wsId, set.id),
            ),
          );
        case _EducationLibraryTab.flashcards:
          final card = _flashcards[index];
          id = card.id;
          child = _FlashcardCard(
            flashcard: card,
            onEdit: () => _showFlashcardSheet(flashcard: card),
            onDelete: () => _confirmDelete(
              title: l10n.educationDeleteFlashcardConfirm,
              onDelete: () => _repository.deleteFlashcard(_wsId, card.id),
            ),
          );
      }
    }
    return PendingSyncFrame(
      key: ValueKey(id),
      workspaceId: _wsId,
      entityId: id,
      feature: 'education',
      child: child,
    );
  }
}
