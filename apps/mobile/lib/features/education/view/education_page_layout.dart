part of 'education_page.dart';

extension _EducationPageLayout on _EducationPageState {
  String _searchHint(AppLocalizations l10n) => _tab == _EducationTab.courses
      ? l10n.educationSearchCoursesHint
      : switch (_libraryTab) {
          _EducationLibraryTab.quizzes => l10n.educationSearchQuizzesHint,
          _EducationLibraryTab.quizSets => l10n.educationSearchQuizSetsHint,
          _EducationLibraryTab.flashcards => l10n.educationSearchFlashcardsHint,
        };

  Widget _buildPage(BuildContext context) {
    final l10n = context.l10n;
    final hasWorkspace = _wsId.isNotEmpty;

    return AppScaffold(
      child: Stack(
        children: [
          ShellMiniNav(
            ownerId: 'education-root-nav:${widget.actorId}:$_wsId',
            locations: const {Routes.education},
            deepLinkBackRoute: Routes.apps,
            items: [
              ShellMiniNavItemSpec(
                id: 'education-overview',
                icon: LucideIcons.house,
                label: l10n.educationOverviewLabel,
                callbackToken: _tab == _EducationTab.overview,
                selected: _tab == _EducationTab.overview,
                enabled: hasWorkspace,
                onPressed: () => _selectTab(_EducationTab.overview),
              ),
              ShellMiniNavItemSpec(
                id: 'education-courses',
                icon: LucideIcons.graduationCap,
                label: l10n.educationCoursesLabel,
                callbackToken: _tab == _EducationTab.courses,
                selected: _tab == _EducationTab.courses,
                enabled: hasWorkspace,
                onPressed: () => _selectTab(_EducationTab.courses),
              ),
              ShellMiniNavItemSpec(
                id: 'education-library',
                icon: LucideIcons.library,
                label: l10n.educationLibraryLabel,
                callbackToken: _tab == _EducationTab.library,
                selected: _tab == _EducationTab.library,
                enabled: hasWorkspace,
                onPressed: () => _selectTab(_EducationTab.library),
              ),
              ShellMiniNavItemSpec(
                id: 'education-attempts',
                icon: LucideIcons.clipboardCheck,
                label: l10n.educationAttemptsLabel,
                callbackToken: _tab == _EducationTab.attempts,
                selected: _tab == _EducationTab.attempts,
                enabled: hasWorkspace,
                onPressed: () => _selectTab(_EducationTab.attempts),
              ),
            ],
          ),
          ShellChromeActions(
            ownerId: 'education-root-actions:${widget.actorId}:$_wsId',
            onResetSection: _resetSearch,
            locations: const {Routes.education},
            actions: [
              if (_tab == _EducationTab.courses ||
                  _tab == _EducationTab.library)
                ShellActionSpec.search(
                  id: 'education-search',
                  active: _searching,
                  tooltip: _searchHint(l10n),
                  callbackToken: (_tab, _libraryTab),
                  controller: _searchController,
                  searchHint: _searchHint(l10n),
                  onSearchChanged: _onSearchChanged,
                  onCloseSearch: _resetSearch,
                  onPressed: () => _updateState(() => _searching = !_searching),
                ),
              if (_tab == _EducationTab.attempts)
                ShellActionSpec(
                  id: 'education-attempt-filters',
                  icon: LucideIcons.listFilter,
                  tooltip: l10n.commonFilters,
                  callbackToken: '$_attemptStatus:${_attemptSetId ?? 'all'}',
                  enabled: hasWorkspace,
                  highlighted: _activeAttemptFilterCount > 0,
                  onPressed: _showAttemptsFilterSheet,
                ),
              if (_tab == _EducationTab.courses ||
                  _tab == _EducationTab.library)
                ShellActionSpec(
                  id: 'education-create',
                  icon: LucideIcons.plus,
                  tooltip: _createTooltip(l10n),
                  callbackToken: '${_tab.name}:${_libraryTab.name}',
                  enabled: hasWorkspace,
                  onPressed: _showCreateSheet,
                ),
            ],
          ),
          _buildEducationList(context),
        ],
      ),
    );
  }

  bool get _shouldShowLoadMore {
    switch (_tab) {
      case _EducationTab.overview:
        return false;
      case _EducationTab.courses:
        return _courses.length < _coursesCount;
      case _EducationTab.library:
        return switch (_libraryTab) {
          _EducationLibraryTab.quizzes => _quizzes.length < _quizzesCount,
          _EducationLibraryTab.quizSets => _quizSets.length < _quizSetsCount,
          _EducationLibraryTab.flashcards =>
            _flashcards.length < _flashcardsCount,
        };
      case _EducationTab.attempts:
        return _attempts.length < _attemptsCount;
    }
  }

  List<Widget> _buildOverview(BuildContext context) {
    return [
      EducationHome(
        workspaceId: _wsId,
        courses: _coursePreview,
        courseCount: _courseSummaryCount,
        quizCount: _quizSummaryCount,
        quizSetCount: _quizSetSummaryCount,
        flashcardCount: _flashcardSummaryCount,
        attemptCount: _attemptSummaryCount,
        attempts: _attemptPreview,
        onOpenCourse: _openCourseDetail,
        onOpenQuizzes: _openQuizPractice,
        onOpenQuizSets: () {
          _selectLibraryTab(_EducationLibraryTab.quizSets);
          _selectTab(_EducationTab.library);
        },
        onOpenFlashcards: _openFlashcardStudy,
        onOpenAttempt: (attempt) => unawaited(_openAttemptDetail(attempt)),
        onSeeCourses: () => _selectTab(_EducationTab.courses),
        onSeeAttempts: () => _selectTab(_EducationTab.attempts),
      ),
    ];
  }

  void _openCourseDetail(EducationCourse course) {
    unawaited(
      showAppSheet<void>(
        context: context,
        builder: (sheetContext) => EducationCourseDetail(
          course: course,
          onPractice: () {
            Navigator.of(sheetContext).pop();
            WidgetsBinding.instance.addPostFrameCallback((_) {
              if (!mounted) return;
              _openQuizPractice(courseId: course.id);
            });
          },
        ),
      ),
    );
  }

  void _openQuizPractice({String? courseId}) {
    unawaited(
      showAppSheet<void>(
        context: context,
        size: AppSheetSize.large,
        builder: (_) => EducationQuizPractice(
          loadQuizzes: () async {
            if (_quizPreview.isNotEmpty) return _quizPreview;
            final page = await _repository.getQuizzes(_wsId);
            return page.items;
          },
          submitAttempt: _learnerRecording
              ? (answers, durationSeconds) => _repository.submitQuizAttempt(
                  _wsId,
                  courseId: courseId,
                  durationSeconds: durationSeconds,
                  answers: answers,
                )
              : null,
          onSubmitted: () {
            if (!mounted) return;
            unawaited(_loadOverview());
          },
        ),
      ),
    );
  }

  void _openFlashcardStudy() {
    unawaited(
      showAppSheet<void>(
        context: context,
        size: AppSheetSize.large,
        builder: (_) => EducationFlashcardStudy(
          loadCards: () async {
            if (_flashcardPreview.isNotEmpty) return _flashcardPreview;
            final page = await _repository.getFlashcards(_wsId);
            return page.items;
          },
        ),
      ),
    );
  }
}
