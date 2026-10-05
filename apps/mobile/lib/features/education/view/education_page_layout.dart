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

    return shad.Scaffold(
      child: Stack(
        children: [
          ShellMiniNav(
            ownerId: 'education-root-nav:${widget.actorId}:$_wsId',
            locations: const {Routes.education},
            deepLinkBackRoute: Routes.apps,
            items: [
              ShellMiniNavItemSpec(
                id: 'education-back',
                icon: Icons.chevron_left,
                label: l10n.navBack,
                callbackToken: 'back',
                onPressed: () => context.go(Routes.apps),
              ),
              ShellMiniNavItemSpec(
                id: 'education-overview',
                icon: Icons.home_outlined,
                label: l10n.educationOverviewLabel,
                callbackToken: _tab == _EducationTab.overview,
                selected: _tab == _EducationTab.overview,
                enabled: hasWorkspace,
                onPressed: () => _selectTab(_EducationTab.overview),
              ),
              ShellMiniNavItemSpec(
                id: 'education-courses',
                icon: Icons.school_outlined,
                label: l10n.educationCoursesLabel,
                callbackToken: _tab == _EducationTab.courses,
                selected: _tab == _EducationTab.courses,
                enabled: hasWorkspace,
                onPressed: () => _selectTab(_EducationTab.courses),
              ),
              ShellMiniNavItemSpec(
                id: 'education-library',
                icon: Icons.library_books_outlined,
                label: l10n.educationLibraryLabel,
                callbackToken: _tab == _EducationTab.library,
                selected: _tab == _EducationTab.library,
                enabled: hasWorkspace,
                onPressed: () => _selectTab(_EducationTab.library),
              ),
              ShellMiniNavItemSpec(
                id: 'education-attempts',
                icon: Icons.assignment_turned_in_outlined,
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
                ShellActionSpec(
                  id: 'education-search',
                  icon: Icons.search_rounded,
                  tooltip: _searchHint(l10n),
                  callbackToken: (_searching, _tab, _libraryTab),
                  inDock: true,
                  searchController: _searching ? _searchController : null,
                  searchHint: _searchHint(l10n),
                  onSearchChanged: _onSearchChanged,
                  onCloseSearch: _resetSearch,
                  onPressed: () => _updateState(() => _searching = !_searching),
                ),
              if (_tab == _EducationTab.attempts)
                ShellActionSpec(
                  id: 'education-attempt-filters',
                  icon: Icons.filter_list_rounded,
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
                  icon: Icons.add_rounded,
                  tooltip: _createTooltip(l10n),
                  callbackToken: '${_tab.name}:${_libraryTab.name}',
                  enabled: hasWorkspace,
                  onPressed: _showCreateSheet,
                ),
            ],
          ),
          ResponsiveWrapper(
            maxWidth: ResponsivePadding.maxContentWidth(context.deviceClass),
            child: _buildEducationList(context),
          ),
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
    final l10n = context.l10n;
    return [
      FinanceSectionHeader(
        title: l10n.educationOverviewHighlightsTitle,
        subtitle: l10n.educationOverviewSubtitle,
      ),
      const SizedBox(height: 14),
      Wrap(
        spacing: 12,
        runSpacing: 12,
        children: [
          _EducationSummaryTile(
            label: l10n.educationCoursesLabel,
            value: _courseSummaryCount,
            icon: Icons.school_outlined,
            tint: shad.Theme.of(context).colorScheme.primary,
            onTap: () => _selectTab(_EducationTab.courses),
          ),
          _EducationSummaryTile(
            label: l10n.educationLibraryQuizzesLabel,
            value: _quizSummaryCount,
            icon: Icons.quiz_outlined,
            tint: shad.Theme.of(context).colorScheme.primary,
            onTap: () {
              _selectLibraryTab(_EducationLibraryTab.quizzes);
              _selectTab(_EducationTab.library);
            },
          ),
          _EducationSummaryTile(
            label: l10n.educationLibraryQuizSetsLabel,
            value: _quizSetSummaryCount,
            icon: Icons.layers_outlined,
            tint: shad.Theme.of(context).colorScheme.primary,
            onTap: () {
              _selectLibraryTab(_EducationLibraryTab.quizSets);
              _selectTab(_EducationTab.library);
            },
          ),
          _EducationSummaryTile(
            label: l10n.educationLibraryFlashcardsLabel,
            value: _flashcardSummaryCount,
            icon: Icons.style_outlined,
            tint: shad.Theme.of(context).colorScheme.primary,
            onTap: () {
              _selectLibraryTab(_EducationLibraryTab.flashcards);
              _selectTab(_EducationTab.library);
            },
          ),
          _EducationSummaryTile(
            label: l10n.educationAttemptsLabel,
            value: _attemptSummaryCount,
            icon: Icons.assignment_turned_in_outlined,
            tint: shad.Theme.of(context).colorScheme.primary,
            onTap: () => _selectTab(_EducationTab.attempts),
          ),
        ],
      ),
      const SizedBox(height: 24),
      FinanceSectionHeader(title: l10n.educationOverviewRecentCoursesTitle),
      const SizedBox(height: 12),
      if (_coursePreview.isEmpty)
        FinanceEmptyState(
          icon: Icons.school_outlined,
          title: l10n.educationCoursesLabel,
          body: l10n.educationEmptyCourses,
        )
      else
        ..._coursePreview.map(
          (course) => PendingSyncFrame(
            workspaceId: _wsId,
            entityId: course.id,
            feature: 'education',
            child: _CourseCard(
              course: course,
              onTap: () => _selectTab(_EducationTab.courses),
            ),
          ),
        ),
      const SizedBox(height: 24),
      FinanceSectionHeader(title: l10n.educationOverviewRecentAttemptsTitle),
      const SizedBox(height: 12),
      if (_attemptPreview.isEmpty)
        FinanceEmptyState(
          icon: Icons.assignment_outlined,
          title: l10n.educationAttemptsLabel,
          body: l10n.educationEmptyAttempts,
        )
      else
        ..._attemptPreview.map(
          (attempt) => _AttemptCard(
            attempt: attempt,
            onTap: () => _openAttemptDetail(attempt),
          ),
        ),
    ];
  }
}
