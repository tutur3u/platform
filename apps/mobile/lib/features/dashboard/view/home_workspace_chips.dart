import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/interaction/app_haptics.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/dashboard/view/home_workspace_chip.dart';
import 'package:mobile/features/dashboard/view/home_workspace_chip_rules.dart';
import 'package:mobile/features/dashboard/view/home_workspace_more.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/features/workspace/data/workspace_pins_repository.dart';
import 'package:mobile/features/workspace/workspace_presentation.dart';
import 'package:mobile/l10n/l10n.dart';

/// Home's workspace chip row: one chip per shown workspace, then More.
/// Tapping a chip switches the current workspace, as the picker does; a long
/// press pins or unpins it.
class HomeWorkspaceChips extends StatefulWidget {
  const HomeWorkspaceChips({this.pinsRepository, super.key});

  final WorkspacePinsRepository? pinsRepository;

  @override
  State<HomeWorkspaceChips> createState() => _HomeWorkspaceChipsState();
}

class _HomeWorkspaceChipsState extends State<HomeWorkspaceChips>
    with WidgetsBindingObserver {
  /// Delays between retries of a failed pins load; resuming the app also
  /// retries.
  static const _retryDelays = [
    Duration(seconds: 2),
    Duration(seconds: 8),
    Duration(seconds: 30),
  ];

  late final WorkspacePinsRepository _repository =
      widget.pinsRepository ?? WorkspacePinsRepository();
  List<String> _pins = const [];
  int _revision = 0;
  bool _requested = false;

  /// Pins can be edited only once the stored list is known, so an edit
  /// never overwrites pins that failed to load.
  bool _loaded = false;

  Timer? _retry;
  int _failures = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _ensurePins(context.read<WorkspaceCubit>().state.workspaces.length);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state != AppLifecycleState.resumed || !_requested || _loaded) return;
    _retry?.cancel();
    unawaited(_load());
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _retry?.cancel();
    super.dispose();
  }

  /// Pins only change the row from [homeChipShowAllBelow] workspaces, so
  /// smaller accounts never fetch them.
  void _ensurePins(int workspaceCount) {
    if (_requested ||
        workspaceCount < homeChipShowAllBelow ||
        context.read<AuthCubit>().state.user == null) {
      return;
    }
    _requested = true;
    unawaited(_load());
  }

  Future<void> _load() async {
    final revision = ++_revision;
    try {
      final pins = await _repository.load();
      if (!mounted || revision != _revision) return;
      _retry?.cancel();
      _failures = 0;
      setState(() {
        _pins = pins;
        _loaded = true;
      });
    } on Exception {
      // The row still shows the current workspace meanwhile. Retry a few
      // times with growing gaps, then wait for the app to resume.
      if (!mounted || revision != _revision) return;
      if (_failures < _retryDelays.length) {
        _retry?.cancel();
        _retry = Timer(_retryDelays[_failures++], () {
          if (mounted && !_loaded) unawaited(_load());
        });
      }
    }
  }

  /// Saves [pins] optimistically and returns the pins that are persisted
  /// afterwards: [pins] on success, the previous pins after a rollback.
  Future<List<String>> _savePins(List<String> pins) async {
    final previous = _pins;
    final revision = ++_revision;
    setState(() => _pins = pins);
    try {
      await _repository.save(pins);
    } on Exception {
      if (!mounted || revision != _revision) return _pins;
      setState(() => _pins = previous);
      showAppToast(
        context,
        message: context.l10n.homeWorkspacePinsFailed,
        variant: AppAlertVariant.destructive,
      );
    }
    return _pins;
  }

  Future<void> _togglePin(Workspace workspace) async {
    final pinned = _pins.contains(workspace.id);
    final l10n = context.l10n;
    final confirmed = await showAppActionSheet<bool>(
      context: context,
      title: displayWorkspaceName(context, workspace),
      actions: [
        AppSheetAction(
          key: const ValueKey('home-workspace-pin-toggle'),
          value: true,
          icon: pinned ? LucideIcons.pinOff : LucideIcons.pin,
          label: pinned ? l10n.homeWorkspaceUnpin : l10n.homeWorkspacePin,
        ),
      ],
    );
    if (confirmed != true || !mounted) return;
    await _savePins(
      pinned
          ? [..._pins.where((id) => id != workspace.id)]
          : [..._pins, workspace.id],
    );
  }

  @override
  Widget build(BuildContext context) {
    return MultiBlocListener(
      listeners: [
        // Pins belong to the signed-in user; an account switch reloads them.
        BlocListener<AuthCubit, AuthState>(
          listenWhen: (previous, current) =>
              previous.user?.id != current.user?.id,
          listener: (context, state) {
            _revision++;
            _retry?.cancel();
            _failures = 0;
            setState(() {
              _pins = const [];
              _loaded = false;
              _requested = false;
            });
            _ensurePins(context.read<WorkspaceCubit>().state.workspaces.length);
          },
        ),
        BlocListener<WorkspaceCubit, WorkspaceState>(
          listenWhen: (previous, current) =>
              previous.workspaces.length != current.workspaces.length,
          listener: (context, state) => _ensurePins(state.workspaces.length),
        ),
      ],
      child: _chips(context),
    );
  }

  Widget _chips(BuildContext context) {
    return BlocBuilder<WorkspaceCubit, WorkspaceState>(
      buildWhen: (previous, current) =>
          previous.workspaces != current.workspaces ||
          previous.currentWorkspace != current.currentWorkspace,
      builder: (context, state) {
        final current = state.currentWorkspace;
        final canPin =
            _loaded && state.workspaces.length >= homeChipShowAllBelow;
        final chips = homeChipWorkspaces(
          workspaces: state.workspaces,
          currentId: current?.id,
          pinnedIds: _pins,
        );
        return Semantics(
          container: true,
          label: context.l10n.homeWorkspaceChipsLabel,
          child: SingleChildScrollView(
            key: const ValueKey('home-workspace-chips'),
            scrollDirection: Axis.horizontal,
            clipBehavior: Clip.none,
            child: Row(
              children: [
                for (final workspace in chips) ...[
                  HomeWorkspaceChip(
                    workspace: workspace,
                    selected: workspace.id == current?.id,
                    pinned: _pins.contains(workspace.id),
                    onTap: () {
                      unawaited(AppHaptics.selection());
                      unawaited(
                        context.read<WorkspaceCubit>().selectWorkspace(
                          workspace,
                        ),
                      );
                    },
                    onTogglePin: canPin
                        ? () => unawaited(_togglePin(workspace))
                        : null,
                  ),
                  const SizedBox(width: AppSpacing.sm),
                ],
                HomeWorkspaceMoreChip(
                  onTap: () => unawaited(
                    showHomeWorkspaceMore(
                      context,
                      workspaces: state.workspaces,
                      shown: chips,
                      pins: _pins,
                      canEditPins: canPin,
                      onPinsChanged: _savePins,
                    ),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}
