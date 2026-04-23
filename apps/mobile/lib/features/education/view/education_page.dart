import 'dart:async';

import 'package:flutter/material.dart' hide Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/responsive/responsive_padding.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/core/responsive/responsive_wrapper.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/models/education/education_models.dart';
import 'package:mobile/data/repositories/education_repository.dart';
import 'package:mobile/features/finance/widgets/finance_ui.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';
import 'package:mobile/features/shell/view/shell_mini_nav.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

enum _EducationTab { overview, courses, library, attempts }

enum _EducationLibraryTab { quizzes, quizSets, flashcards }

class EducationPage extends StatefulWidget {
  const EducationPage({super.key});

  @override
  State<EducationPage> createState() => _EducationPageState();
}

class _EducationPageState extends State<EducationPage> {
  static const int _overviewPreviewSize = 3;

  late final EducationRepository _repository;
  final TextEditingController _searchController = TextEditingController();
  Timer? _searchDebounce;

  _EducationTab _tab = _EducationTab.overview;
  _EducationLibraryTab _libraryTab = _EducationLibraryTab.quizzes;
  bool _isLoading = false;
  bool _isLoadingMore = false;
  String? _error;
  int _requestToken = 0;

  List<EducationCourse> _coursePreview = const <EducationCourse>[];
  int _courseSummaryCount = 0;
  List<EducationCourse> _courses = const <EducationCourse>[];
  int _coursesPage = 1;
  int _coursesCount = 0;

  int _quizSummaryCount = 0;
  List<EducationQuiz> _quizzes = const <EducationQuiz>[];
  int _quizzesPage = 1;
  int _quizzesCount = 0;

  int _quizSetSummaryCount = 0;
  List<EducationQuizSet> _quizSets = const <EducationQuizSet>[];
  int _quizSetsPage = 1;
  int _quizSetsCount = 0;

  int _flashcardSummaryCount = 0;
  List<EducationFlashcard> _flashcards = const <EducationFlashcard>[];
  int _flashcardsPage = 1;
  int _flashcardsCount = 0;

  List<EducationAttemptSummary> _attemptPreview =
      const <EducationAttemptSummary>[];
  int _attemptSummaryCount = 0;
  List<EducationAttemptSummary> _attempts = const <EducationAttemptSummary>[];
  int _attemptsPage = 1;
  int _attemptsCount = 0;
  List<EducationAttemptFilterSet> _attemptSets =
      const <EducationAttemptFilterSet>[];
  String _attemptStatus = 'all';
  String? _attemptSetId;

  String? get _wsId =>
      context.read<WorkspaceCubit>().state.currentWorkspace?.id;

  @override
  void initState() {
    super.initState();
    _repository = EducationRepository();
    unawaited(Future<void>.delayed(Duration.zero, _loadOverview));
  }

  @override
  void dispose() {
    _searchDebounce?.cancel();
    _searchController.dispose();
    _repository.dispose();
    super.dispose();
  }

  Future<void> _loadOverview() async {
    final wsId = _wsId;
    if (wsId == null || wsId.isEmpty) return;

    final requestToken = ++_requestToken;
    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      final results = await Future.wait<dynamic>([
        _repository.getCourses(wsId, pageSize: _overviewPreviewSize),
        _repository.getQuizzes(wsId, pageSize: _overviewPreviewSize),
        _repository.getQuizSets(wsId, pageSize: _overviewPreviewSize),
        _repository.getFlashcards(wsId, pageSize: _overviewPreviewSize),
        _repository.getAttempts(
          wsId,
          pageSize: _overviewPreviewSize,
          status: _attemptStatus,
          setId: _attemptSetId,
        ),
      ]);

      if (!mounted || requestToken != _requestToken) return;

      final courseResult = results[0] as EducationPagedResult<EducationCourse>;
      final quizResult = results[1] as EducationPagedResult<EducationQuiz>;
      final setResult = results[2] as EducationPagedResult<EducationQuizSet>;
      final flashcardResult =
          results[3] as EducationPagedResult<EducationFlashcard>;
      final attemptResult = results[4] as EducationAttemptListResult;

      setState(() {
        _coursePreview = courseResult.items;
        _courseSummaryCount = courseResult.count;
        _quizSummaryCount = quizResult.count;
        _quizSetSummaryCount = setResult.count;
        _flashcardSummaryCount = flashcardResult.count;
        _attemptPreview = attemptResult.attempts;
        _attemptSummaryCount = attemptResult.count;
        _attemptSets = attemptResult.sets;
      });
    } on Object catch (error) {
      if (!mounted || requestToken != _requestToken) return;
      setState(() {
        _error = error.toString();
      });
    } finally {
      if (mounted && requestToken == _requestToken) {
        setState(() {
          _isLoading = false;
          _isLoadingMore = false;
        });
      }
    }
  }

  Future<void> _loadCourses({bool append = false}) async {
    final wsId = _wsId;
    if (wsId == null || wsId.isEmpty) return;
    final requestToken = ++_requestToken;
    final nextPage = append ? _coursesPage + 1 : 1;

    setState(() {
      if (append) {
        _isLoadingMore = true;
      } else {
        _isLoading = true;
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
      setState(() {
        _courses = append
            ? <EducationCourse>[..._courses, ...result.items]
            : result.items;
        _coursesPage = nextPage;
        _coursesCount = result.count;
        _courseSummaryCount = result.count;
      });
    } on Object catch (error) {
      if (!mounted || requestToken != _requestToken) return;
      setState(() => _error = error.toString());
    } finally {
      if (mounted && requestToken == _requestToken) {
        setState(() {
          _isLoading = false;
          _isLoadingMore = false;
        });
      }
    }
  }

  Future<void> _loadLibrary({bool append = false}) async {
    final wsId = _wsId;
    if (wsId == null || wsId.isEmpty) return;
    final requestToken = ++_requestToken;

    setState(() {
      if (append) {
        _isLoadingMore = true;
      } else {
        _isLoading = true;
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
          setState(() {
            _quizzes = append
                ? <EducationQuiz>[..._quizzes, ...result.items]
                : result.items;
            _quizzesPage = nextPage;
            _quizzesCount = result.count;
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
          setState(() {
            _quizSets = append
                ? <EducationQuizSet>[..._quizSets, ...result.items]
                : result.items;
            _quizSetsPage = nextPage;
            _quizSetsCount = result.count;
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
          setState(() {
            _flashcards = append
                ? <EducationFlashcard>[..._flashcards, ...result.items]
                : result.items;
            _flashcardsPage = nextPage;
            _flashcardsCount = result.count;
            _flashcardSummaryCount = result.count;
          });
          return;
      }
    } on Object catch (error) {
      if (!mounted || requestToken != _requestToken) return;
      setState(() => _error = error.toString());
    } finally {
      if (mounted && requestToken == _requestToken) {
        setState(() {
          _isLoading = false;
          _isLoadingMore = false;
        });
      }
    }
  }

  Future<void> _loadAttempts({bool append = false}) async {
    final wsId = _wsId;
    if (wsId == null || wsId.isEmpty) return;
    final requestToken = ++_requestToken;
    final nextPage = append ? _attemptsPage + 1 : 1;

    setState(() {
      if (append) {
        _isLoadingMore = true;
      } else {
        _isLoading = true;
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
      setState(() {
        _attempts = append
            ? <EducationAttemptSummary>[..._attempts, ...result.attempts]
            : result.attempts;
        _attemptsPage = nextPage;
        _attemptsCount = result.count;
        _attemptSummaryCount = result.count;
        _attemptSets = result.sets;
      });
    } on Object catch (error) {
      if (!mounted || requestToken != _requestToken) return;
      setState(() => _error = error.toString());
    } finally {
      if (mounted && requestToken == _requestToken) {
        setState(() {
          _isLoading = false;
          _isLoadingMore = false;
        });
      }
    }
  }

  Future<void> _reloadCurrentTab() async {
    switch (_tab) {
      case _EducationTab.overview:
        return _loadOverview();
      case _EducationTab.courses:
        return _loadCourses();
      case _EducationTab.library:
        return _loadLibrary();
      case _EducationTab.attempts:
        return _loadAttempts();
    }
  }

  Future<void> _loadMore() async {
    if (_isLoading || _isLoadingMore) return;
    switch (_tab) {
      case _EducationTab.overview:
        return;
      case _EducationTab.courses:
        if (_courses.length >= _coursesCount) return;
        return _loadCourses(append: true);
      case _EducationTab.library:
        final canLoadMore = switch (_libraryTab) {
          _EducationLibraryTab.quizzes => _quizzes.length < _quizzesCount,
          _EducationLibraryTab.quizSets => _quizSets.length < _quizSetsCount,
          _EducationLibraryTab.flashcards =>
            _flashcards.length < _flashcardsCount,
        };
        if (!canLoadMore) return;
        return _loadLibrary(append: true);
      case _EducationTab.attempts:
        if (_attempts.length >= _attemptsCount) return;
        return _loadAttempts(append: true);
    }
  }

  void _selectTab(_EducationTab nextTab) {
    if (_tab == nextTab) return;
    setState(() {
      _tab = nextTab;
      _searchController.clear();
      _error = null;
    });
    unawaited(_reloadCurrentTab());
  }

  void _selectLibraryTab(_EducationLibraryTab nextTab) {
    if (_libraryTab == nextTab) return;
    setState(() {
      _libraryTab = nextTab;
      _searchController.clear();
      _error = null;
    });
    if (_tab == _EducationTab.library) {
      unawaited(_loadLibrary());
    }
  }

  void _onSearchChanged(String value) {
    _searchDebounce?.cancel();
    _searchDebounce = Timer(const Duration(milliseconds: 300), () {
      if (!mounted) return;
      if (_tab == _EducationTab.courses) {
        unawaited(_loadCourses());
      } else if (_tab == _EducationTab.library) {
        unawaited(_loadLibrary());
      }
    });
  }

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
        return _showCourseSheet();
      case _EducationTab.library:
        switch (_libraryTab) {
          case _EducationLibraryTab.quizzes:
            return _showQuizSheet();
          case _EducationLibraryTab.quizSets:
            return _showQuizSetSheet();
          case _EducationLibraryTab.flashcards:
            return _showFlashcardSheet();
        }
      case _EducationTab.overview:
      case _EducationTab.attempts:
        return;
    }
  }

  Future<void> _showCourseSheet({EducationCourse? course}) async {
    final wsId = _wsId;
    if (wsId == null) return;
    final result = await showModalBottomSheet<bool>(
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
    if (wsId == null) return;
    final result = await showModalBottomSheet<bool>(
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
    if (wsId == null) return;
    final result = await showModalBottomSheet<bool>(
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
    if (wsId == null) return;
    final result = await showModalBottomSheet<bool>(
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
    final confirmed = await showDialog<bool>(
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
    final result = await showModalBottomSheet<Map<String, String?>>(
      context: context,
      isScrollControlled: true,
      builder: (context) => _AttemptsFilterSheet(
        sets: _attemptSets,
        selectedSetId: _attemptSetId,
        selectedStatus: _attemptStatus,
      ),
    );

    if (result == null) return;
    setState(() {
      _attemptSetId = result['setId'];
      _attemptStatus = result['status'] ?? 'all';
    });
    await _loadAttempts();
  }

  Future<void> _openAttemptDetail(EducationAttemptSummary attempt) async {
    final wsId = _wsId;
    if (wsId == null) return;
    if (!mounted) return;

    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (context) => FractionallySizedBox(
        heightFactor: 0.86,
        child: FutureBuilder<EducationAttemptDetail>(
          future: _repository.getAttemptDetail(wsId, attempt.id),
          builder: (context, snapshot) {
            if (!snapshot.hasData) {
              if (snapshot.hasError) {
                return Padding(
                  padding: const EdgeInsets.all(24),
                  child: Center(child: Text(snapshot.error.toString())),
                );
              }
              return const Center(child: NovaLoadingIndicator());
            }
            return _AttemptDetailSheet(detail: snapshot.data!);
          },
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

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final hasWorkspace = _wsId != null && _wsId!.isNotEmpty;

    return BlocListener<WorkspaceCubit, WorkspaceState>(
      listenWhen: (previous, current) =>
          previous.currentWorkspace?.id != current.currentWorkspace?.id,
      listener: (_, state) {
        _searchController.clear();
        _attemptSetId = null;
        _attemptStatus = 'all';
        unawaited(_loadOverview());
      },
      child: shad.Scaffold(
        child: Stack(
          children: [
            ShellMiniNav(
              ownerId: 'education-root-nav',
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
              ownerId: 'education-root-actions',
              locations: const {Routes.education},
              actions: [
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
              child:
                  _isLoading &&
                      _coursePreview.isEmpty &&
                      _courses.isEmpty &&
                      _attemptPreview.isEmpty
                  ? const Center(child: NovaLoadingIndicator())
                  : RefreshIndicator(
                      onRefresh: _reloadCurrentTab,
                      child: ListView(
                        padding: EdgeInsets.fromLTRB(
                          16,
                          8,
                          16,
                          40 + MediaQuery.paddingOf(context).bottom,
                        ),
                        children: [
                          if (_error != null)
                            FinanceEmptyState(
                              icon: Icons.error_outline_rounded,
                              title: l10n.commonSomethingWentWrong,
                              body: _error!,
                            )
                          else
                            ...switch (_tab) {
                              _EducationTab.overview => _buildOverview(context),
                              _EducationTab.courses => _buildCourses(context),
                              _EducationTab.library => _buildLibrary(context),
                              _EducationTab.attempts => _buildAttempts(context),
                            },
                          if (_shouldShowLoadMore) ...[
                            const SizedBox(height: 16),
                            Center(
                              child: FilledButton.tonal(
                                onPressed: _isLoadingMore ? null : _loadMore,
                                child: _isLoadingMore
                                    ? const SizedBox(
                                        width: 18,
                                        height: 18,
                                        child: CircularProgressIndicator(
                                          strokeWidth: 2,
                                        ),
                                      )
                                    : Text(l10n.commonLoadMore),
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
            ),
          ],
        ),
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
            tint: const Color(0xFF2B6CB0),
            onTap: () => _selectTab(_EducationTab.courses),
          ),
          _EducationSummaryTile(
            label: l10n.educationLibraryQuizzesLabel,
            value: _quizSummaryCount,
            icon: Icons.quiz_outlined,
            tint: const Color(0xFF2F855A),
            onTap: () {
              _selectLibraryTab(_EducationLibraryTab.quizzes);
              _selectTab(_EducationTab.library);
            },
          ),
          _EducationSummaryTile(
            label: l10n.educationLibraryQuizSetsLabel,
            value: _quizSetSummaryCount,
            icon: Icons.layers_outlined,
            tint: const Color(0xFF805AD5),
            onTap: () {
              _selectLibraryTab(_EducationLibraryTab.quizSets);
              _selectTab(_EducationTab.library);
            },
          ),
          _EducationSummaryTile(
            label: l10n.educationLibraryFlashcardsLabel,
            value: _flashcardSummaryCount,
            icon: Icons.style_outlined,
            tint: const Color(0xFF0EA5A4),
            onTap: () {
              _selectLibraryTab(_EducationLibraryTab.flashcards);
              _selectTab(_EducationTab.library);
            },
          ),
          _EducationSummaryTile(
            label: l10n.educationAttemptsLabel,
            value: _attemptSummaryCount,
            icon: Icons.assignment_turned_in_outlined,
            tint: const Color(0xFFD97706),
            onTap: () => _selectTab(_EducationTab.attempts),
          ),
        ],
      ),
      const SizedBox(height: 24),
      FinanceSectionHeader(
        title: l10n.educationOverviewRecentCoursesTitle,
      ),
      const SizedBox(height: 12),
      if (_coursePreview.isEmpty)
        FinanceEmptyState(
          icon: Icons.school_outlined,
          title: l10n.educationCoursesLabel,
          body: l10n.educationEmptyCourses,
        )
      else
        ..._coursePreview.map(
          (course) => _CourseCard(
            course: course,
            onTap: () => _selectTab(_EducationTab.courses),
          ),
        ),
      const SizedBox(height: 24),
      FinanceSectionHeader(
        title: l10n.educationOverviewRecentAttemptsTitle,
      ),
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

  List<Widget> _buildCourses(BuildContext context) {
    final l10n = context.l10n;
    return [
      FinanceSectionHeader(
        title: l10n.educationCoursesLabel,
        subtitle: l10n.educationCoursesSubtitle,
      ),
      const SizedBox(height: 12),
      TextField(
        controller: _searchController,
        onChanged: _onSearchChanged,
        decoration: InputDecoration(
          prefixIcon: const Icon(Icons.search),
          hintText: l10n.educationSearchCoursesHint,
        ),
      ),
      const SizedBox(height: 12),
      if (_courses.isEmpty)
        FinanceEmptyState(
          icon: Icons.school_outlined,
          title: l10n.educationCoursesLabel,
          body: l10n.educationEmptyCourses,
        )
      else
        ..._courses.map(
          (course) => _CourseCard(
            course: course,
            onEdit: () => _showCourseSheet(course: course),
            onDelete: () => _confirmDelete(
              title: l10n.educationDeleteCourseConfirm(course.name),
              onDelete: () => _repository.deleteCourse(_wsId!, course.id),
            ),
          ),
        ),
    ];
  }

  List<Widget> _buildLibrary(BuildContext context) {
    final l10n = context.l10n;
    return [
      FinanceSectionHeader(
        title: l10n.educationLibraryLabel,
        subtitle: l10n.educationLibrarySubtitle,
      ),
      const SizedBox(height: 12),
      TextField(
        controller: _searchController,
        onChanged: _onSearchChanged,
        decoration: InputDecoration(
          prefixIcon: const Icon(Icons.search),
          hintText: _libraryTab == _EducationLibraryTab.quizzes
              ? l10n.educationSearchQuizzesHint
              : _libraryTab == _EducationLibraryTab.quizSets
              ? l10n.educationSearchQuizSetsHint
              : l10n.educationSearchFlashcardsHint,
        ),
      ),
      const SizedBox(height: 12),
      Wrap(
        spacing: 8,
        runSpacing: 8,
        children: [
          _EducationLibraryToggle(
            label: l10n.educationLibraryQuizzesLabel,
            selected: _libraryTab == _EducationLibraryTab.quizzes,
            onTap: () => _selectLibraryTab(_EducationLibraryTab.quizzes),
          ),
          _EducationLibraryToggle(
            label: l10n.educationLibraryQuizSetsLabel,
            selected: _libraryTab == _EducationLibraryTab.quizSets,
            onTap: () => _selectLibraryTab(_EducationLibraryTab.quizSets),
          ),
          _EducationLibraryToggle(
            label: l10n.educationLibraryFlashcardsLabel,
            selected: _libraryTab == _EducationLibraryTab.flashcards,
            onTap: () => _selectLibraryTab(_EducationLibraryTab.flashcards),
          ),
        ],
      ),
      const SizedBox(height: 14),
      ...switch (_libraryTab) {
        _EducationLibraryTab.quizzes => _buildQuizLibrary(context),
        _EducationLibraryTab.quizSets => _buildQuizSetLibrary(context),
        _EducationLibraryTab.flashcards => _buildFlashcardLibrary(context),
      },
    ];
  }

  List<Widget> _buildQuizLibrary(BuildContext context) {
    final l10n = context.l10n;
    if (_quizzes.isEmpty) {
      return [
        FinanceEmptyState(
          icon: Icons.quiz_outlined,
          title: l10n.educationLibraryQuizzesLabel,
          body: l10n.educationEmptyQuizzes,
        ),
      ];
    }
    return _quizzes
        .map(
          (quiz) => _QuizCard(
            quiz: quiz,
            onEdit: () => _showQuizSheet(quiz: quiz),
            onDelete: () => _confirmDelete(
              title: l10n.educationDeleteQuizConfirm,
              onDelete: () => _repository.deleteQuiz(_wsId!, quiz.id),
            ),
          ),
        )
        .toList(growable: false);
  }

  List<Widget> _buildQuizSetLibrary(BuildContext context) {
    final l10n = context.l10n;
    if (_quizSets.isEmpty) {
      return [
        FinanceEmptyState(
          icon: Icons.layers_outlined,
          title: l10n.educationLibraryQuizSetsLabel,
          body: l10n.educationEmptyQuizSets,
        ),
      ];
    }
    return _quizSets
        .map(
          (quizSet) => _QuizSetCard(
            quizSet: quizSet,
            onEdit: () => _showQuizSetSheet(quizSet: quizSet),
            onDelete: () => _confirmDelete(
              title: l10n.educationDeleteQuizSetConfirm(quizSet.name),
              onDelete: () => _repository.deleteQuizSet(_wsId!, quizSet.id),
            ),
          ),
        )
        .toList(growable: false);
  }

  List<Widget> _buildFlashcardLibrary(BuildContext context) {
    final l10n = context.l10n;
    if (_flashcards.isEmpty) {
      return [
        FinanceEmptyState(
          icon: Icons.style_outlined,
          title: l10n.educationLibraryFlashcardsLabel,
          body: l10n.educationEmptyFlashcards,
        ),
      ];
    }
    return _flashcards
        .map(
          (flashcard) => _FlashcardCard(
            flashcard: flashcard,
            onEdit: () => _showFlashcardSheet(flashcard: flashcard),
            onDelete: () => _confirmDelete(
              title: l10n.educationDeleteFlashcardConfirm,
              onDelete: () => _repository.deleteFlashcard(_wsId!, flashcard.id),
            ),
          ),
        )
        .toList(growable: false);
  }

  List<Widget> _buildAttempts(BuildContext context) {
    final l10n = context.l10n;
    return [
      FinanceSectionHeader(
        title: l10n.educationAttemptsLabel,
        subtitle: l10n.educationAttemptsSubtitle,
      ),
      const SizedBox(height: 12),
      Wrap(
        spacing: 8,
        runSpacing: 8,
        children: [
          _EducationBadge(
            icon: Icons.filter_alt_outlined,
            label: '${l10n.commonFilters}: $_activeAttemptFilterCount',
            tint: const Color(0xFFD97706),
          ),
          _EducationBadge(
            icon: Icons.tune_rounded,
            label: _attemptStatus == 'all'
                ? l10n.commonAll
                : _attemptStatus == 'completed'
                ? l10n.educationAttemptStatusCompleted
                : l10n.educationAttemptStatusIncomplete,
            tint: const Color(0xFFD97706),
          ),
        ],
      ),
      const SizedBox(height: 12),
      if (_attempts.isEmpty)
        FinanceEmptyState(
          icon: Icons.assignment_outlined,
          title: l10n.educationAttemptsLabel,
          body: l10n.educationEmptyAttempts,
        )
      else
        ..._attempts.map(
          (attempt) => _AttemptCard(
            attempt: attempt,
            onTap: () => _openAttemptDetail(attempt),
          ),
        ),
    ];
  }
}

class _EducationSummaryTile extends StatelessWidget {
  const _EducationSummaryTile({
    required this.label,
    required this.value,
    required this.icon,
    required this.tint,
    required this.onTap,
  });

  final String label;
  final int value;
  final IconData icon;
  final Color tint;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 168,
      child: FinancePanel(
        onTap: onTap,
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 38,
              height: 38,
              decoration: BoxDecoration(
                color: tint.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Icon(icon, color: tint, size: 20),
            ),
            const SizedBox(height: 14),
            Text(
              NumberFormat.compact().format(value),
              style: shad.Theme.of(context).typography.h3.copyWith(
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              label,
              style: shad.Theme.of(context).typography.textSmall.copyWith(
                color: shad.Theme.of(context).colorScheme.mutedForeground,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _EducationBadge extends StatelessWidget {
  const _EducationBadge({
    required this.icon,
    required this.label,
    required this.tint,
  });

  final IconData icon;
  final String label;
  final Color tint;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: tint.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: tint.withValues(alpha: 0.22)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 15, color: tint),
          const SizedBox(width: 8),
          Text(
            label,
            style: shad.Theme.of(context).typography.small.copyWith(
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

class _EducationLibraryToggle extends StatelessWidget {
  const _EducationLibraryToggle({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return ChoiceChip(
      label: Text(label),
      selected: selected,
      onSelected: (_) => onTap(),
    );
  }
}

class _CourseCard extends StatelessWidget {
  const _CourseCard({
    required this.course,
    this.onTap,
    this.onEdit,
    this.onDelete,
  });

  final EducationCourse course;
  final VoidCallback? onTap;
  final VoidCallback? onEdit;
  final VoidCallback? onDelete;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: FinancePanel(
        onTap: onTap,
        padding: const EdgeInsets.all(14),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: const Color(0xFF2563EB).withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(14),
              ),
              child: const Icon(
                Icons.school_outlined,
                color: Color(0xFF2563EB),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    course.name,
                    style: shad.Theme.of(context).typography.large.copyWith(
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  if (course.description?.isNotEmpty ?? false) ...[
                    const SizedBox(height: 4),
                    Text(
                      course.description!,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: shad.Theme.of(context).typography.textSmall
                          .copyWith(
                            color: shad.Theme.of(
                              context,
                            ).colorScheme.mutedForeground,
                          ),
                    ),
                  ],
                  const SizedBox(height: 10),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      _EducationBadge(
                        icon: Icons.layers_outlined,
                        label: '${course.modulesCount}',
                        tint: const Color(0xFF2563EB),
                      ),
                      if (course.certTemplate?.isNotEmpty ?? false)
                        _EducationBadge(
                          icon: Icons.verified_outlined,
                          label: course.certTemplate!,
                          tint: const Color(0xFF2563EB),
                        ),
                    ],
                  ),
                ],
              ),
            ),
            if (onEdit != null || onDelete != null)
              PopupMenuButton<String>(
                onSelected: (value) {
                  if (value == 'edit') onEdit?.call();
                  if (value == 'delete') onDelete?.call();
                },
                itemBuilder: (context) => [
                  if (onEdit != null)
                    PopupMenuItem(
                      value: 'edit',
                      child: Text(context.l10n.commonEdit),
                    ),
                  if (onDelete != null)
                    PopupMenuItem(
                      value: 'delete',
                      child: Text(context.l10n.commonDelete),
                    ),
                ],
              ),
          ],
        ),
      ),
    );
  }
}

class _QuizSetCard extends StatelessWidget {
  const _QuizSetCard({
    required this.quizSet,
    this.onEdit,
    this.onDelete,
  });

  final EducationQuizSet quizSet;
  final VoidCallback? onEdit;
  final VoidCallback? onDelete;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: FinancePanel(
        padding: const EdgeInsets.all(14),
        child: Row(
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: const Color(0xFF805AD5).withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(14),
              ),
              child: const Icon(
                Icons.layers_outlined,
                color: Color(0xFF805AD5),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    quizSet.name,
                    style: shad.Theme.of(context).typography.large.copyWith(
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 8),
                  _EducationBadge(
                    icon: Icons.link_outlined,
                    label: '${quizSet.linkedModulesCount}',
                    tint: const Color(0xFF805AD5),
                  ),
                ],
              ),
            ),
            PopupMenuButton<String>(
              onSelected: (value) {
                if (value == 'edit') onEdit?.call();
                if (value == 'delete') onDelete?.call();
              },
              itemBuilder: (context) => [
                PopupMenuItem(
                  value: 'edit',
                  child: Text(context.l10n.commonEdit),
                ),
                PopupMenuItem(
                  value: 'delete',
                  child: Text(context.l10n.commonDelete),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _QuizCard extends StatelessWidget {
  const _QuizCard({
    required this.quiz,
    this.onEdit,
    this.onDelete,
  });

  final EducationQuiz quiz;
  final VoidCallback? onEdit;
  final VoidCallback? onDelete;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: FinancePanel(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Text(
                    quiz.question,
                    style: shad.Theme.of(context).typography.large.copyWith(
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
                PopupMenuButton<String>(
                  onSelected: (value) {
                    if (value == 'edit') onEdit?.call();
                    if (value == 'delete') onDelete?.call();
                  },
                  itemBuilder: (context) => [
                    PopupMenuItem(
                      value: 'edit',
                      child: Text(context.l10n.commonEdit),
                    ),
                    PopupMenuItem(
                      value: 'delete',
                      child: Text(context.l10n.commonDelete),
                    ),
                  ],
                ),
              ],
            ),
            const SizedBox(height: 10),
            ...quiz.options
                .take(4)
                .map(
                  (option) => Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: _EducationBadge(
                      icon: option.isCorrect
                          ? Icons.check_circle_outline_rounded
                          : Icons.radio_button_unchecked_rounded,
                      label: option.value,
                      tint: option.isCorrect
                          ? const Color(0xFF2F855A)
                          : const Color(0xFF64748B),
                    ),
                  ),
                ),
          ],
        ),
      ),
    );
  }
}

class _FlashcardCard extends StatelessWidget {
  const _FlashcardCard({
    required this.flashcard,
    this.onEdit,
    this.onDelete,
  });

  final EducationFlashcard flashcard;
  final VoidCallback? onEdit;
  final VoidCallback? onDelete;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: FinancePanel(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    flashcard.front,
                    style: shad.Theme.of(context).typography.large.copyWith(
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
                PopupMenuButton<String>(
                  onSelected: (value) {
                    if (value == 'edit') onEdit?.call();
                    if (value == 'delete') onDelete?.call();
                  },
                  itemBuilder: (context) => [
                    PopupMenuItem(
                      value: 'edit',
                      child: Text(context.l10n.commonEdit),
                    ),
                    PopupMenuItem(
                      value: 'delete',
                      child: Text(context.l10n.commonDelete),
                    ),
                  ],
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              flashcard.back,
              style: shad.Theme.of(context).typography.textSmall.copyWith(
                color: shad.Theme.of(context).colorScheme.mutedForeground,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _AttemptCard extends StatelessWidget {
  const _AttemptCard({
    required this.attempt,
    required this.onTap,
  });

  final EducationAttemptSummary attempt;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final tint = attempt.completed
        ? const Color(0xFF2F855A)
        : const Color(0xFFD97706);
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: FinancePanel(
        onTap: onTap,
        padding: const EdgeInsets.all(14),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: tint.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Icon(Icons.assignment_turned_in_outlined, color: tint),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    attempt.learnerName ?? attempt.learnerEmail ?? attempt.id,
                    style: shad.Theme.of(context).typography.large.copyWith(
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    attempt.setName ?? context.l10n.educationAttemptsLabel,
                    style: shad.Theme.of(context).typography.textSmall.copyWith(
                      color: shad.Theme.of(context).colorScheme.mutedForeground,
                    ),
                  ),
                  const SizedBox(height: 10),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      _EducationBadge(
                        icon: Icons.flag_outlined,
                        label: attempt.completed
                            ? context.l10n.educationAttemptStatusCompleted
                            : context.l10n.educationAttemptStatusIncomplete,
                        tint: tint,
                      ),
                      _EducationBadge(
                        icon: Icons.score_outlined,
                        label: attempt.totalScore.toStringAsFixed(1),
                        tint: tint,
                      ),
                      _EducationBadge(
                        icon: Icons.timer_outlined,
                        label: _formatDuration(attempt.durationSeconds),
                        tint: tint,
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CourseSheet extends StatefulWidget {
  const _CourseSheet({
    required this.title,
    required this.onSubmit,
    this.initialName,
    this.initialDescription,
  });

  final String title;
  final String? initialName;
  final String? initialDescription;
  final Future<void> Function(String name, String? description) onSubmit;

  @override
  State<_CourseSheet> createState() => _CourseSheetState();
}

class _CourseSheetState extends State<_CourseSheet> {
  late final TextEditingController _nameController;
  late final TextEditingController _descriptionController;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _nameController = TextEditingController(text: widget.initialName);
    _descriptionController = TextEditingController(
      text: widget.initialDescription,
    );
  }

  @override
  void dispose() {
    _nameController.dispose();
    _descriptionController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_nameController.text.trim().isEmpty) return;
    setState(() => _submitting = true);
    try {
      await widget.onSubmit(
        _nameController.text.trim(),
        _descriptionController.text.trim().isEmpty
            ? null
            : _descriptionController.text.trim(),
      );
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        top: 16,
        bottom: 16 + MediaQuery.viewInsetsOf(context).bottom,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            widget.title,
            style: shad.Theme.of(context).typography.large.copyWith(
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _nameController,
            decoration: InputDecoration(
              labelText: context.l10n.educationCourseNameLabel,
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _descriptionController,
            minLines: 3,
            maxLines: 5,
            decoration: InputDecoration(
              labelText: context.l10n.educationCourseDescriptionLabel,
            ),
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: TextButton(
                  onPressed: _submitting
                      ? null
                      : () => Navigator.of(context).pop(false),
                  child: Text(context.l10n.commonCancel),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: FilledButton(
                  onPressed: _submitting ? null : _submit,
                  child: Text(context.l10n.commonSave),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _SimpleEducationSheet extends StatefulWidget {
  const _SimpleEducationSheet({
    required this.title,
    required this.fieldLabel,
    required this.onSubmit,
    this.secondaryLabel,
    this.initialValue,
    this.initialSecondaryValue,
  });

  final String title;
  final String fieldLabel;
  final String? secondaryLabel;
  final String? initialValue;
  final String? initialSecondaryValue;
  final Future<void> Function(String value, String secondaryValue) onSubmit;

  @override
  State<_SimpleEducationSheet> createState() => _SimpleEducationSheetState();
}

class _SimpleEducationSheetState extends State<_SimpleEducationSheet> {
  late final TextEditingController _primaryController;
  late final TextEditingController _secondaryController;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _primaryController = TextEditingController(text: widget.initialValue);
    _secondaryController = TextEditingController(
      text: widget.initialSecondaryValue,
    );
  }

  @override
  void dispose() {
    _primaryController.dispose();
    _secondaryController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_primaryController.text.trim().isEmpty) return;
    if (widget.secondaryLabel != null &&
        _secondaryController.text.trim().isEmpty) {
      return;
    }
    setState(() => _submitting = true);
    try {
      await widget.onSubmit(
        _primaryController.text.trim(),
        _secondaryController.text.trim(),
      );
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        top: 16,
        bottom: 16 + MediaQuery.viewInsetsOf(context).bottom,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            widget.title,
            style: shad.Theme.of(context).typography.large.copyWith(
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _primaryController,
            minLines: widget.secondaryLabel == null ? 1 : 2,
            maxLines: widget.secondaryLabel == null ? 1 : 4,
            decoration: InputDecoration(labelText: widget.fieldLabel),
          ),
          if (widget.secondaryLabel != null) ...[
            const SizedBox(height: 12),
            TextField(
              controller: _secondaryController,
              minLines: 2,
              maxLines: 4,
              decoration: InputDecoration(labelText: widget.secondaryLabel),
            ),
          ],
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: TextButton(
                  onPressed: _submitting
                      ? null
                      : () => Navigator.of(context).pop(false),
                  child: Text(context.l10n.commonCancel),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: FilledButton(
                  onPressed: _submitting ? null : _submit,
                  child: Text(context.l10n.commonSave),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _QuizSheet extends StatefulWidget {
  const _QuizSheet({
    required this.title,
    required this.onSubmit,
    this.initialQuiz,
  });

  final String title;
  final EducationQuiz? initialQuiz;
  final Future<void> Function(
    String question,
    List<Map<String, dynamic>> options,
  )
  onSubmit;

  @override
  State<_QuizSheet> createState() => _QuizSheetState();
}

class _QuizSheetState extends State<_QuizSheet> {
  late final TextEditingController _questionController;
  late List<_QuizOptionDraft> _options;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _questionController = TextEditingController(
      text: widget.initialQuiz?.question,
    );
    _options = (widget.initialQuiz?.options ?? const <EducationQuizOption>[])
        .map(_QuizOptionDraft.fromOption)
        .toList(growable: true);
    if (_options.length < 2) {
      _options = [
        _QuizOptionDraft.empty(correct: true),
        _QuizOptionDraft.empty(),
      ];
    }
  }

  @override
  void dispose() {
    _questionController.dispose();
    for (final option in _options) {
      option.dispose();
    }
    super.dispose();
  }

  Future<void> _submit() async {
    final question = _questionController.text.trim();
    if (question.isEmpty) return;
    final cleanedOptions = _options
        .map(
          (option) => {
            if (option.id?.isNotEmpty ?? false) 'id': option.id,
            'value': option.controller.text.trim(),
            'is_correct': option.isCorrect,
            'explanation': option.explanationController.text.trim().isEmpty
                ? null
                : option.explanationController.text.trim(),
          },
        )
        .where((option) => option['value']?.toString().isNotEmpty ?? false)
        .toList(growable: false);

    if (cleanedOptions.length < 2 ||
        !cleanedOptions.any((option) => option['is_correct'] == true)) {
      return;
    }

    setState(() => _submitting = true);
    try {
      await widget.onSubmit(question, cleanedOptions);
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        top: 16,
        bottom: 16 + MediaQuery.viewInsetsOf(context).bottom,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            widget.title,
            style: shad.Theme.of(context).typography.large.copyWith(
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _questionController,
            minLines: 2,
            maxLines: 4,
            decoration: InputDecoration(
              labelText: context.l10n.educationQuizQuestionLabel,
            ),
          ),
          const SizedBox(height: 12),
          ...List.generate(_options.length, (index) {
            final option = _options[index];
            return Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: FinancePanel(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            context.l10n.educationQuizOptionLabel(index + 1),
                            style: shad.Theme.of(context).typography.small
                                .copyWith(fontWeight: FontWeight.w700),
                          ),
                        ),
                        Switch(
                          value: option.isCorrect,
                          onChanged: (value) {
                            setState(() => option.isCorrect = value);
                          },
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    TextField(
                      controller: option.controller,
                      decoration: InputDecoration(
                        labelText: context.l10n.educationQuizOptionValueLabel,
                      ),
                    ),
                    const SizedBox(height: 8),
                    TextField(
                      controller: option.explanationController,
                      decoration: InputDecoration(
                        labelText:
                            context.l10n.educationQuizOptionExplanationLabel,
                      ),
                    ),
                    if (_options.length > 2)
                      Align(
                        alignment: Alignment.centerRight,
                        child: TextButton(
                          onPressed: () {
                            setState(() {
                              _options.removeAt(index).dispose();
                            });
                          },
                          child: Text(context.l10n.commonDelete),
                        ),
                      ),
                  ],
                ),
              ),
            );
          }),
          TextButton.icon(
            onPressed: () {
              setState(() => _options.add(_QuizOptionDraft.empty()));
            },
            icon: const Icon(Icons.add_rounded),
            label: Text(context.l10n.educationAddOption),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: TextButton(
                  onPressed: _submitting
                      ? null
                      : () => Navigator.of(context).pop(false),
                  child: Text(context.l10n.commonCancel),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: FilledButton(
                  onPressed: _submitting ? null : _submit,
                  child: Text(context.l10n.commonSave),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _AttemptsFilterSheet extends StatefulWidget {
  const _AttemptsFilterSheet({
    required this.sets,
    required this.selectedSetId,
    required this.selectedStatus,
  });

  final List<EducationAttemptFilterSet> sets;
  final String? selectedSetId;
  final String selectedStatus;

  @override
  State<_AttemptsFilterSheet> createState() => _AttemptsFilterSheetState();
}

class _AttemptsFilterSheetState extends State<_AttemptsFilterSheet> {
  late String _status;
  String? _setId;

  @override
  void initState() {
    super.initState();
    _status = widget.selectedStatus;
    _setId = widget.selectedSetId;
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        top: 16,
        bottom: 16 + MediaQuery.viewInsetsOf(context).bottom,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            context.l10n.commonFilters,
            style: shad.Theme.of(context).typography.large.copyWith(
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 16),
          DropdownButtonFormField<String>(
            initialValue: _status,
            decoration: InputDecoration(
              labelText: context.l10n.educationAttemptStatusLabel,
            ),
            items: [
              DropdownMenuItem(
                value: 'all',
                child: Text(context.l10n.commonAll),
              ),
              DropdownMenuItem(
                value: 'completed',
                child: Text(context.l10n.educationAttemptStatusCompleted),
              ),
              DropdownMenuItem(
                value: 'incomplete',
                child: Text(context.l10n.educationAttemptStatusIncomplete),
              ),
            ],
            onChanged: (value) => setState(() => _status = value ?? 'all'),
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String?>(
            initialValue: _setId,
            decoration: InputDecoration(
              labelText: context.l10n.educationAttemptQuizSetLabel,
            ),
            items: [
              DropdownMenuItem(
                child: Text(context.l10n.commonAll),
              ),
              ...widget.sets.map(
                (set) => DropdownMenuItem<String?>(
                  value: set.id,
                  child: Text(set.name),
                ),
              ),
            ],
            onChanged: (value) => setState(() => _setId = value),
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: TextButton(
                  onPressed: () => Navigator.of(context).pop({
                    'status': 'all',
                    'setId': null,
                  }),
                  child: Text(context.l10n.educationClearFilters),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: FilledButton(
                  onPressed: () => Navigator.of(context).pop({
                    'status': _status,
                    'setId': _setId,
                  }),
                  child: Text(context.l10n.commonApply),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _AttemptDetailSheet extends StatelessWidget {
  const _AttemptDetailSheet({required this.detail});

  final EducationAttemptDetail detail;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: ListView(
        children: [
          Text(
            detail.learner?.fullName ??
                detail.learner?.email ??
                detail.attempt.id,
            style: shad.Theme.of(context).typography.h3.copyWith(
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _EducationBadge(
                icon: Icons.score_outlined,
                label: detail.attempt.totalScore.toStringAsFixed(1),
                tint: const Color(0xFF2563EB),
              ),
              _EducationBadge(
                icon: Icons.timer_outlined,
                label: _formatDuration(detail.attempt.durationSeconds),
                tint: const Color(0xFF2563EB),
              ),
            ],
          ),
          const SizedBox(height: 20),
          ...detail.answers.map(
            (answer) => Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: FinancePanel(
                padding: const EdgeInsets.all(14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      answer.question ?? answer.quizId,
                      style: shad.Theme.of(context).typography.large.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 8),
                    if (answer.selectedOptionValue != null)
                      Text(
                        answer.selectedOptionValue!,
                        style: shad.Theme.of(context).typography.textSmall,
                      ),
                    const SizedBox(height: 10),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: answer.options
                          .map(
                            (option) => _EducationBadge(
                              icon: option.isCorrect
                                  ? Icons.check_circle_outline_rounded
                                  : Icons.radio_button_unchecked_rounded,
                              label: option.value,
                              tint: option.id == answer.selectedOptionId
                                  ? const Color(0xFF2563EB)
                                  : option.isCorrect
                                  ? const Color(0xFF2F855A)
                                  : const Color(0xFF64748B),
                            ),
                          )
                          .toList(growable: false),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

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
