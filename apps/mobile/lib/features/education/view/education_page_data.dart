part of 'education_page.dart';

extension _EducationPageData on _EducationPageState {
  Future<void> _loadCourses({bool append = false}) async {
    final wsId = _wsId;
    if (wsId.isEmpty) return;
    final requestToken = ++_requestToken;
    final nextPage = append ? _coursesPage + 1 : 1;

    _updateState(() {
      if (append) {
        _isLoadingMore = true;
      } else {
        _isLoading = true;
        _isLoadingMore = false;
        _error = null;
      }
    });

    try {
      final result = await _repository.getCourses(
        wsId,
        query: _searchController.text,
        page: nextPage,
      );
      if (!mounted || requestToken != _requestToken) return;
      _updateState(() {
        _courses = append
            ? _mergeEducation(_courses, result.items, (row) => row.id)
            : result.items;
        _coursesPage = nextPage;
        _coursesCount = append && result.items.isEmpty
            ? _courses.length
            : result.count;
        _courseSummaryCount = result.count;
      });
    } on Object catch (error) {
      if (!mounted || requestToken != _requestToken) return;
      _handleLoadFailure(error);
    } finally {
      if (mounted && requestToken == _requestToken) {
        _updateState(() {
          _isLoading = false;
          _isLoadingMore = false;
        });
        WidgetsBinding.instance.addPostFrameCallback((_) => _maybeLoadMore());
      }
    }
  }

  Future<void> _loadLibrary({bool append = false}) async {
    final wsId = _wsId;
    if (wsId.isEmpty) return;
    final requestToken = ++_requestToken;

    _updateState(() {
      if (append) {
        _isLoadingMore = true;
      } else {
        _isLoading = true;
        _isLoadingMore = false;
        _error = null;
      }
    });

    try {
      switch (_libraryTab) {
        case _EducationLibraryTab.quizzes:
          final nextPage = append ? _quizzesPage + 1 : 1;
          final result = await _repository.getQuizzes(
            wsId,
            query: _searchController.text,
            page: nextPage,
          );
          if (!mounted || requestToken != _requestToken) return;
          _updateState(() {
            _quizzes = append
                ? _mergeEducation(_quizzes, result.items, (row) => row.id)
                : result.items;
            _quizzesPage = nextPage;
            _quizzesCount = append && result.items.isEmpty
                ? _quizzes.length
                : result.count;
            _quizSummaryCount = result.count;
          });
          return;
        case _EducationLibraryTab.quizSets:
          final nextPage = append ? _quizSetsPage + 1 : 1;
          final result = await _repository.getQuizSets(
            wsId,
            query: _searchController.text,
            page: nextPage,
          );
          if (!mounted || requestToken != _requestToken) return;
          _updateState(() {
            _quizSets = append
                ? _mergeEducation(_quizSets, result.items, (row) => row.id)
                : result.items;
            _quizSetsPage = nextPage;
            _quizSetsCount = append && result.items.isEmpty
                ? _quizSets.length
                : result.count;
            _quizSetSummaryCount = result.count;
          });
          return;
        case _EducationLibraryTab.flashcards:
          final nextPage = append ? _flashcardsPage + 1 : 1;
          final result = await _repository.getFlashcards(
            wsId,
            query: _searchController.text,
            page: nextPage,
          );
          if (!mounted || requestToken != _requestToken) return;
          _updateState(() {
            _flashcards = append
                ? _mergeEducation(_flashcards, result.items, (row) => row.id)
                : result.items;
            _flashcardsPage = nextPage;
            _flashcardsCount = append && result.items.isEmpty
                ? _flashcards.length
                : result.count;
            _flashcardSummaryCount = result.count;
          });
          return;
      }
    } on Object catch (error) {
      if (!mounted || requestToken != _requestToken) return;
      _handleLoadFailure(error);
    } finally {
      if (mounted && requestToken == _requestToken) {
        _updateState(() {
          _isLoading = false;
          _isLoadingMore = false;
        });
        WidgetsBinding.instance.addPostFrameCallback((_) => _maybeLoadMore());
      }
    }
  }

  Future<void> _loadAttempts({bool append = false}) async {
    final wsId = _wsId;
    if (wsId.isEmpty) return;
    final requestToken = ++_requestToken;
    final nextPage = append ? _attemptsPage + 1 : 1;

    _updateState(() {
      if (append) {
        _isLoadingMore = true;
      } else {
        _isLoading = true;
        _isLoadingMore = false;
        _error = null;
      }
    });

    try {
      final result = await _repository.getAttempts(
        wsId,
        page: nextPage,
        status: _attemptStatus,
        setId: _attemptSetId,
      );
      if (!mounted || requestToken != _requestToken) return;
      _updateState(() {
        _attempts = append
            ? _mergeEducation(_attempts, result.attempts, (row) => row.id)
            : result.attempts;
        _attemptsPage = nextPage;
        _attemptsCount = append && result.attempts.isEmpty
            ? _attempts.length
            : result.count;
        _attemptSummaryCount = result.count;
        _attemptSets = result.sets;
      });
    } on Object catch (error) {
      if (!mounted || requestToken != _requestToken) return;
      _handleLoadFailure(error);
    } finally {
      if (mounted && requestToken == _requestToken) {
        _updateState(() {
          _isLoading = false;
          _isLoadingMore = false;
        });
        WidgetsBinding.instance.addPostFrameCallback((_) => _maybeLoadMore());
      }
    }
  }

  void _maybeLoadMore() {
    if (!mounted ||
        _refreshing ||
        _isLoading ||
        _isLoadingMore ||
        _pagingFailed ||
        !_scrollController.hasClients) {
      return;
    }
    if (_scrollController.position.extentAfter < 400) {
      unawaited(_loadMore());
    }
  }

  void _resetSearch() {
    _searchDebounce?.cancel();
    _updateState(() {
      _searching = false;
      _searchController.clear();
    });
    unawaited(_reloadCurrentTab());
  }

  Future<void> _reloadCurrentTab({bool force = false}) async {
    final cycle = ++_refreshCycle;
    _pagingFailed = false;
    _refreshing = true;
    Future<void> read() async {
      if (!mounted || cycle != _refreshCycle) return;
      await _reloadCurrentTabBody();
    }

    try {
      if (force) {
        await CacheStore.awaitRevalidation(read);
      } else {
        await CacheStore.readWithRevalidation<void>(read, onSnapshot: (_) {});
      }
    } finally {
      if (mounted && cycle == _refreshCycle) {
        _refreshing = false;
        WidgetsBinding.instance.addPostFrameCallback((_) => _maybeLoadMore());
      }
    }
  }

  Future<void> _reloadCurrentTabBody() async {
    switch (_tab) {
      case _EducationTab.overview:
        return await _loadOverview();
      case _EducationTab.courses:
        return await _loadCourses();
      case _EducationTab.library:
        return await _loadLibrary();
      case _EducationTab.attempts:
        return await _loadAttempts();
    }
  }

  Future<void> _loadMore() async {
    if (_refreshing || _isLoading || _isLoadingMore) return;
    switch (_tab) {
      case _EducationTab.overview:
        return;
      case _EducationTab.courses:
        if (_courses.length >= _coursesCount) return;
        return await CacheStore.awaitRevalidation(
          () => _loadCourses(append: true),
        );
      case _EducationTab.library:
        final canLoadMore = switch (_libraryTab) {
          _EducationLibraryTab.quizzes => _quizzes.length < _quizzesCount,
          _EducationLibraryTab.quizSets => _quizSets.length < _quizSetsCount,
          _EducationLibraryTab.flashcards =>
            _flashcards.length < _flashcardsCount,
        };
        if (!canLoadMore) return;
        return await CacheStore.awaitRevalidation(
          () => _loadLibrary(append: true),
        );
      case _EducationTab.attempts:
        if (_attempts.length >= _attemptsCount) return;
        return await CacheStore.awaitRevalidation(
          () => _loadAttempts(append: true),
        );
    }
  }

  void _selectTab(_EducationTab nextTab) {
    if (_tab == nextTab) return;
    _updateState(() {
      _tab = nextTab;
      _searching = false;
      _searchController.clear();
      _error = null;
    });
    unawaited(_reloadCurrentTab());
  }

  void _selectLibraryTab(_EducationLibraryTab nextTab) {
    if (_libraryTab == nextTab) return;
    _updateState(() {
      _libraryTab = nextTab;
      _searching = false;
      _searchController.clear();
      _error = null;
    });
    if (_tab == _EducationTab.library) {
      unawaited(_reloadCurrentTab());
    }
  }

  void _onSearchChanged(String value) {
    _searchDebounce?.cancel();
    _requestToken++;
    _refreshCycle++;
    _updateState(() {
      _isLoading = true;
      _isLoadingMore = false;
    });
    _searchDebounce = Timer(const Duration(milliseconds: 300), () {
      if (!mounted) return;
      if (_tab == _EducationTab.courses) {
        unawaited(_reloadCurrentTab());
      } else if (_tab == _EducationTab.library) {
        unawaited(_reloadCurrentTab());
      }
    });
  }
}
