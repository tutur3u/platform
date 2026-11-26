import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/tasks_boards/collaboration/cubit/collab_failure.dart';
import 'package:mobile/features/tasks_boards/collaboration/cubit/sharing_cubits.dart';
import 'package:mobile/features/tasks_boards/collaboration/data/task_sharing_repository.dart';
import 'package:mobile/features/tasks_boards/collaboration/models/task_sharing_models.dart';
import 'package:mobile/features/tasks_boards/collaboration/widgets/collab_common.dart';
import 'package:mobile/features/tasks_boards/collaboration/widgets/sharing_widgets.dart';
import 'package:mobile/features/workspace/workspace_presentation.dart';
import 'package:mobile/l10n/l10n.dart';

/// Opens web's task sharing: the task's link and the people invited to it.
Future<void> showTaskShareSheet(
  BuildContext context, {
  required String wsId,
  required String taskId,
  required String taskName,
}) {
  final repository =
      context.read<TaskSharingRepository?>() ?? TaskSharingRepository();
  return showAppSheet<void>(
    context: context,
    size: AppSheetSize.large,
    builder: (_) => BlocProvider(
      create: (_) {
        final cubit = TaskSharingCubit(
          repository: repository,
          wsId: wsId,
          taskId: taskId,
        );
        unawaited(cubit.load());
        return cubit;
      },
      child: TaskShareSheet(wsId: wsId, taskName: taskName),
    ),
  );
}

class TaskShareSheet extends StatelessWidget {
  const TaskShareSheet({required this.wsId, required this.taskName, super.key});

  final String wsId;
  final String taskName;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return BlocBuilder<TaskSharingCubit, SharingState<TaskShareLink>>(
      builder: (context, state) {
        final cubit = context.read<TaskSharingCubit>();
        return AppSheetScaffold(
          title: l10n.taskShareTitle,
          description: taskName,
          child: switch (state.load) {
            CollabLoad.loading => const CollabStatus.loading(),
            CollabLoad.failed => CollabStatus.failed(
              failure: state.loadFailure ?? CollabFailure.other,
              message: l10n.taskShareLoadFailed,
              onRetry: () => unawaited(cubit.load()),
            ),
            CollabLoad.loaded => _TaskShareBody(wsId: wsId, state: state),
          },
        );
      },
    );
  }
}

class _TaskShareBody extends StatelessWidget {
  const _TaskShareBody({required this.wsId, required this.state});

  final String wsId;
  final SharingState<TaskShareLink> state;

  Future<void> _run(
    BuildContext context,
    Future<CollabFailure?> Function() change, {
    required String success,
    required String fallback,
  }) async {
    final failure = await change();
    if (!context.mounted) return;
    showCollabResult(context, failure, fallback: fallback, success: success);
  }

  Future<void> _revoke(BuildContext context, TaskSharingCubit cubit) async {
    final l10n = context.l10n;
    final confirmed = await showAppConfirmDialog(
      context: context,
      title: l10n.taskShareRevokeLinkTitle,
      message: l10n.taskShareRevokeLinkDescription,
      confirmLabel: l10n.taskShareRevokeLink,
      cancelLabel: l10n.commonCancel,
      destructive: true,
    );
    if (!confirmed || !context.mounted) return;
    await _run(
      context,
      cubit.revokeLink,
      success: l10n.taskShareLinkDeleted,
      fallback: l10n.taskShareFailed,
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    final cubit = context.read<TaskSharingCubit>();
    final link = state.link;
    final url = cubit.shareUrl;
    final internal = isSystemWorkspaceId(wsId);
    final enabled = !state.busy;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: AppLayout.sectionGap,
      children: [
        CollabSection(
          title: l10n.taskShareAddPeople,
          child: ShareInviteField(
            placeholder: l10n.taskShareEmailHint,
            enabled: enabled,
            busy: state.busy,
            onInvite: (email) async {
              final failure = await cubit.addPerson(email);
              if (!context.mounted) return false;
              showCollabResult(
                context,
                failure,
                fallback: failure == CollabFailure.invalid
                    ? l10n.taskShareInvalidEmail
                    : l10n.taskShareFailed,
                success: l10n.taskShareCreated,
              );
              return failure == null;
            },
          ),
        ),
        if (state.shares.isNotEmpty)
          CollabSection(
            title: l10n.taskSharePeopleWithAccess,
            child: ShareGrantList(
              shares: state.shares,
              enabled: enabled,
              viewLabel: l10n.taskShareViewer,
              editLabel: l10n.taskShareEditor,
              onPermission: (share, permission) => unawaited(
                _run(
                  context,
                  () => cubit.setPermission(share.id, permission),
                  success: l10n.taskSharePermissionUpdated,
                  fallback: l10n.taskShareFailed,
                ),
              ),
              onRemove: (share) => unawaited(
                _run(
                  context,
                  () => cubit.removePerson(share.id),
                  success: l10n.taskShareRemoved,
                  fallback: l10n.taskShareFailed,
                ),
              ),
            ),
          ),
        if (link != null && url != null)
          CollabSection(
            title: l10n.taskShareCopyLink,
            child: AppCard(
              padding: const EdgeInsets.all(AppSpacing.md),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                spacing: AppSpacing.sm,
                children: [
                  Text(
                    link.publicAccess
                        ? l10n.taskShareAnyoneCanView
                        : l10n.taskShareOnlyInvited,
                    style: tokens.typography.small.copyWith(
                      color: tokens.colorScheme.mutedForeground,
                    ),
                  ),
                  ShareLinkActions(
                    url: url,
                    subject: l10n.taskShareTitle,
                    copiedMessage: l10n.taskShareLinkCopied,
                    enabled: enabled,
                  ),
                  AppToggleRow(
                    key: const ValueKey('task-share-public'),
                    title: Text(l10n.taskSharePublicAccess),
                    value: link.publicAccess,
                    onChanged: !enabled || link.requiresInvite
                        ? null
                        : (value) {
                            // The route admits public task links only in the
                            // internal workspace, as web explains.
                            if (!internal) {
                              showAppToast(
                                context,
                                message: l10n.taskSharePublicAccessInternalOnly,
                              );
                              return;
                            }
                            unawaited(
                              _run(
                                context,
                                () => cubit.setPublicAccess(value),
                                success: l10n.taskShareLinkUpdated,
                                fallback: l10n.taskShareFailed,
                              ),
                            );
                          },
                  ),
                  if (internal)
                    AppToggleRow(
                      key: const ValueKey('task-share-invite-only'),
                      title: Text(l10n.taskShareInviteOnly),
                      value: link.requiresInvite,
                      onChanged: enabled
                          ? (value) => unawaited(
                              _run(
                                context,
                                () => cubit.setInviteOnly(value),
                                success: l10n.taskShareLinkUpdated,
                                fallback: l10n.taskShareFailed,
                              ),
                            )
                          : null,
                    ),
                  AppButton.ghost(
                    key: const ValueKey('task-share-revoke'),
                    onPressed: enabled
                        ? () => unawaited(_revoke(context, cubit))
                        : null,
                    leading: Icon(
                      LucideIcons.trash2,
                      size: 16,
                      color: tokens.colorScheme.destructive,
                    ),
                    child: Text(
                      l10n.taskShareRevokeLink,
                      style: TextStyle(color: tokens.colorScheme.destructive),
                    ),
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }
}
