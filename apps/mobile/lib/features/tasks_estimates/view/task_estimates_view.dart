import 'dart:async';

import 'package:flutter/material.dart' hide AppBar, Card, Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/responsive/responsive_padding.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/core/responsive/responsive_wrapper.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/repositories/workspace_permissions_repository.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/tasks_estimates/cubit/task_estimates_cubit.dart';
import 'package:mobile/features/tasks_estimates/widgets/task_estimate_boards_section.dart';
import 'package:mobile/features/tasks_estimates/widgets/task_estimates_feedback.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class TaskEstimatesView extends StatefulWidget {
  const TaskEstimatesView({super.key});

  @override
  State<TaskEstimatesView> createState() => _TaskEstimatesViewState();
}

class _TaskEstimatesViewState extends State<TaskEstimatesView> {
  final WorkspacePermissionsRepository _permissionsRepository =
      WorkspacePermissionsRepository();
  String? _permissionsWorkspaceId;
  bool _canManageProjects = false;
  bool _isCheckingPermissions = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();

    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == _permissionsWorkspaceId) {
      return;
    }

    _permissionsWorkspaceId = wsId;
    unawaited(_loadPermissions());
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    return shad.Scaffold(
      headers: [
        shad.AppBar(
          leading: [
            shad.OutlineButton(
              density: shad.ButtonDensity.icon,
              onPressed: () {
                final router = GoRouter.of(context);
                if (router.canPop()) {
                  router.pop();
                  return;
                }
                context.go(Routes.tasks);
              },
              child: const Icon(Icons.arrow_back),
            ),
          ],
          title: Text(l10n.taskEstimatesTitle),
        ),
      ],
      child: BlocListener<WorkspaceCubit, WorkspaceState>(
        listenWhen: (prev, curr) =>
            prev.currentWorkspace?.id != curr.currentWorkspace?.id,
        listener: (context, state) {
          final wsId = state.currentWorkspace?.id;
          if (wsId != null) {
            unawaited(context.read<TaskEstimatesCubit>().loadBoards(wsId));
          }
        },
        child: _buildContent(context),
      ),
    );
  }

  Widget _buildContent(BuildContext context) {
    if (_isCheckingPermissions) {
      return const Center(child: shad.CircularProgressIndicator());
    }

    if (!_canManageProjects) {
      return const TaskEstimatesAccessDenied();
    }

    return BlocBuilder<TaskEstimatesCubit, TaskEstimatesState>(
      builder: (context, state) {
        if (state.status == TaskEstimatesStatus.loading &&
            state.boards.isEmpty) {
          return const Center(child: shad.CircularProgressIndicator());
        }

        if (state.status == TaskEstimatesStatus.error && state.boards.isEmpty) {
          return TaskEstimatesErrorView(error: state.error);
        }

        return ResponsiveWrapper(
          maxWidth: ResponsivePadding.maxContentWidth(context.deviceClass),
          child: RefreshIndicator(
            onRefresh: () => _reload(context),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(0, 16, 0, 32),
              children: [
                TaskEstimateBoardsSection(
                  boards: state.boards,
                  isUpdating: state.status == TaskEstimatesStatus.updating,
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Future<void> _loadPermissions() async {
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    final currentUserId = context.read<AuthCubit>().state.user?.id;

    if (!mounted) {
      return;
    }
    setState(() => _isCheckingPermissions = true);

    if (wsId == null || currentUserId == null) {
      if (!mounted) {
        return;
      }
      setState(() {
        _canManageProjects = false;
        _isCheckingPermissions = false;
      });
      return;
    }

    try {
      final permissions = await _permissionsRepository.getPermissions(
        wsId: wsId,
        userId: currentUserId,
      );

      if (!mounted) {
        return;
      }
      setState(() {
        _canManageProjects = permissions.containsPermission('manage_projects');
        _isCheckingPermissions = false;
      });
    } on Exception {
      if (!mounted) {
        return;
      }
      setState(() {
        _canManageProjects = false;
        _isCheckingPermissions = false;
      });
    }
  }

  Future<void> _reload(BuildContext context) async {
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null) {
      return;
    }
    await context.read<TaskEstimatesCubit>().loadBoards(wsId);
  }
}
