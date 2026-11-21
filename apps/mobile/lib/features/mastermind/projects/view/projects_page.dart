import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/startup/foreground_refresh.dart';
import 'package:mobile/core/ui/components/account_overlay_scope.dart';
import 'package:mobile/features/mastermind/access/mastermind_access_cubit.dart';
import 'package:mobile/features/mastermind/projects/cubit/projects_cubit.dart';
import 'package:mobile/features/mastermind/projects/data/projects_live.dart';
import 'package:mobile/features/mastermind/projects/data/projects_models.dart';
import 'package:mobile/features/mastermind/projects/data/projects_repository.dart';
import 'package:mobile/features/mastermind/projects/view/projects_controls.dart';
import 'package:mobile/features/mastermind/projects/view/projects_list_view.dart';
import 'package:mobile/features/mastermind/view/mastermind_states.dart';
import 'package:mobile/widgets/nova_refresh_indicator.dart';

/// `/mastermind/work`: every thread on the bridge machine grouped by
/// project, or a linked machine's threads newest first.
///
/// The list is a snapshot read on entry, on resume, on pull to refresh and
/// on a live `threads` poke; it is never polled.
class ProjectsPage extends StatelessWidget {
  const ProjectsPage({
    this.initialState,
    this.repository,
    this.live = true,
    this.now,
    super.key,
  });

  final ProjectThreadState? initialState;
  final ProjectsRepository? repository;

  /// Listens to the owner socket for `threads` pokes.
  final bool live;
  final DateTime Function()? now;

  @override
  Widget build(BuildContext context) {
    final admitted = context.select<MastermindAccessCubit?, bool>(
      (cubit) =>
          cubit == null ||
          (cubit.state.status == MastermindAccessStatus.loaded &&
              cubit.state.enabled),
    );
    if (!admitted) return const MastermindSkeleton();
    return _ProjectsBody(page: this);
  }
}

class _ProjectsBody extends StatefulWidget {
  const _ProjectsBody({required this.page});

  final ProjectsPage page;

  @override
  State<_ProjectsBody> createState() => _ProjectsBodyState();
}

class _ProjectsBodyState extends State<_ProjectsBody>
    with WidgetsBindingObserver {
  late final ProjectsRepository _repository =
      widget.page.repository ?? sharedProjectsRepository();
  late final ProjectsCubit _cubit = ProjectsCubit(
    repository: _repository,
    initialFilter: widget.page.initialState,
    clock: widget.page.now,
  );
  StreamSubscription<Object?>? _frames;
  final _search = TextEditingController();
  Timer? _debounce;
  bool _foreground = true;
  bool _privacyReady = false;
  bool _loaded = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    final lifecycle = WidgetsBinding.instance.lifecycleState;
    _foreground = lifecycle == null || lifecycle == AppLifecycleState.resumed;
    if (widget.page.live) {
      _frames = ProjectsLive.shared.frames.listen((frame) {
        if (isThreadsPoke(frame, _cubit.state.machine?.machineId)) {
          unawaited(_cubit.refresh());
        }
      });
    }
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _privacyReady = AccountOverlayScope.maybeOf(context)?.allowed ?? true;
    _activate(refresh: false);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final resumed = state == AppLifecycleState.resumed;
    final cameBack = resumed && !_foreground;
    _foreground = resumed;
    _activate(refresh: cameBack);
  }

  void _activate({required bool refresh}) {
    if (!_foreground || !_privacyReady) {
      if (widget.page.live) ProjectsLive.shared.release(this);
      return;
    }
    ForegroundRefresh.request(this, () {
      if (!mounted || !_foreground || !_privacyReady) return;
      if (widget.page.live) ProjectsLive.shared.hold(this);
      if (!_loaded) {
        _loaded = true;
        unawaited(_cubit.load());
      } else if (refresh) {
        unawaited(_cubit.refresh());
      }
    });
  }

  void _onSearch(String value) {
    _debounce?.cancel();
    _debounce = Timer(
      const Duration(milliseconds: 300),
      () => unawaited(_cubit.setSearch(value)),
    );
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _debounce?.cancel();
    unawaited(_frames?.cancel());
    if (widget.page.live) ProjectsLive.shared.release(this);
    _search.dispose();
    unawaited(_cubit.close());
    super.dispose();
  }

  @override
  Widget build(BuildContext context) =>
      BlocListener<ProjectsCubit, ProjectsState>(
        bloc: _cubit,
        // A search whose read failed is withdrawn; the field shows the one
        // in effect again.
        listenWhen: (previous, current) =>
            previous.rollbacks != current.rollbacks,
        listener: (context, state) {
          _debounce?.cancel();
          if (_search.text.trim() != state.search) _search.text = state.search;
        },
        child: BlocBuilder<ProjectsCubit, ProjectsState>(
          bloc: _cubit,
          builder: (context, state) => NovaRefreshIndicator(
            onRefresh: _cubit.refresh,
            child: AppPageScrollView(
              physics: const AlwaysScrollableScrollPhysics(),
              keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
              slivers: [
                SliverToBoxAdapter(
                  child: ProjectsControls(
                    state: state,
                    search: _search,
                    onSearch: _onSearch,
                    onFilter: (f) => unawaited(_cubit.setFilter(f)),
                    onMachine: (m) => unawaited(_cubit.selectMachine(m)),
                  ),
                ),
                SliverToBoxAdapter(
                  child: ProjectsListView(
                    state: state,
                    cubit: _cubit,
                    now: (widget.page.now ?? DateTime.now)().toUtc(),
                  ),
                ),
              ],
            ),
          ),
        ),
      );
}
