import 'dart:async';
import 'package:flutter/material.dart' hide Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/responsive/responsive_padding.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/core/responsive/responsive_wrapper.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/models/education/education_models.dart';
import 'package:mobile/data/repositories/education_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/finance/widgets/finance_ui.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';
import 'package:mobile/features/shell/view/shell_mini_nav.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';
import 'package:mobile/widgets/pending_sync_frame.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

part 'education_cards.dart';
part 'education_attempt_reader.dart';
part 'education_lazy_list.dart';
part 'education_owned_overlay.dart';
part 'education_page_data.dart';
part 'education_overview_data.dart';
part 'education_page_actions.dart';
part 'education_page_layout.dart';
part 'education_components.dart';
part 'education_author_forms.dart';
part 'education_quiz_form.dart';
part 'education_attempt_views.dart';
part 'education_helpers.dart';

enum _EducationTab { overview, courses, library, attempts }

enum _EducationLibraryTab { quizzes, quizSets, flashcards }

class EducationPage extends StatelessWidget {
  const EducationPage({super.key});
  @override
  Widget build(BuildContext context) {
    final actor = context.select<AuthCubit, String?>((c) => c.state.user?.id);
    final workspace = context.select<WorkspaceCubit, String?>(
      (c) => c.state.currentWorkspace?.id,
    );
    if (actor == null || workspace == null) return const SizedBox.shrink();
    return EducationWorkspace(
      key: ValueKey('$actor:$workspace'),
      actorId: actor,
      workspaceId: workspace,
    );
  }
}

class EducationWorkspace extends StatefulWidget {
  const EducationWorkspace({
    required this.actorId,
    required this.workspaceId,
    super.key,
    this.repository,
  });
  final String actorId;
  final String workspaceId;
  final EducationRepository? repository;
  @override
  State<EducationWorkspace> createState() => _EducationPageState();
}

class _EducationPageState extends State<EducationWorkspace> {
  late final EducationRepository _repository;
  final TextEditingController _searchController = TextEditingController();
  Timer? _searchDebounce;
  final ScrollController _scrollController = ScrollController();
  final ValueNotifier<bool> _alive = ValueNotifier(true);
  bool _searching = false;
  bool _pagingFailed = false;
  bool _refreshing = false;
  int _refreshCycle = 0;

  _EducationTab _tab = _EducationTab.overview;
  _EducationLibraryTab _libraryTab = _EducationLibraryTab.quizzes;
  bool _isLoading = true;
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

  String get _wsId => widget.workspaceId;

  @override
  void initState() {
    super.initState();
    _repository =
        widget.repository ??
        EducationRepository(expectedUserId: widget.actorId);
    _scrollController.addListener(_maybeLoadMore);
    unawaited(Future<void>.delayed(Duration.zero, _reloadCurrentTab));
  }

  @override
  void dispose() {
    _searchDebounce?.cancel();
    _searchController.dispose();
    _alive.value = false;
    _alive.dispose();
    _requestToken++;
    _refreshCycle++;
    _scrollController.dispose();
    if (widget.repository == null) _repository.dispose();
    super.dispose();
  }

  void _updateState(VoidCallback update) {
    if (mounted) setState(update);
  }

  @override
  Widget build(BuildContext context) => _buildPage(context);
}
