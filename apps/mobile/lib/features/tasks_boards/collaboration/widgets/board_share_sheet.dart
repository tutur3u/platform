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
import 'package:mobile/l10n/l10n.dart';

/// Opens web's board sharing: the public read-only link and direct guests.
Future<void> showBoardShareSheet(
  BuildContext context, {
  required String wsId,
  required String boardId,
  required String boardName,
}) {
  final repository =
      context.read<TaskSharingRepository?>() ?? TaskSharingRepository();
  final locale = Localizations.localeOf(context).languageCode;
  return showAppSheet<void>(
    context: context,
    size: AppSheetSize.large,
    builder: (_) => BlocProvider(
      create: (_) {
        final cubit = BoardSharingCubit(
          repository: repository,
          wsId: wsId,
          boardId: boardId,
          locale: locale,
        );
        unawaited(cubit.load());
        return cubit;
      },
      child: BoardShareSheet(boardName: boardName),
    ),
  );
}

class BoardShareSheet extends StatelessWidget {
  const BoardShareSheet({required this.boardName, super.key});

  final String boardName;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return BlocBuilder<BoardSharingCubit, SharingState<BoardPublicLink>>(
      builder: (context, state) {
        final cubit = context.read<BoardSharingCubit>();
        return AppSheetScaffold(
          title: l10n.boardShareTitle(boardName),
          child: switch (state.load) {
            CollabLoad.loading => const CollabStatus.loading(),
            // Reading needs view access to the board; say so rather than retry.
            CollabLoad.failed
                when state.loadFailure == CollabFailure.forbidden =>
              CollabStatus.empty(l10n.boardSharePermissionError),
            CollabLoad.failed => CollabStatus.failed(
              failure: state.loadFailure ?? CollabFailure.other,
              message: l10n.taskShareLoadFailed,
              onRetry: () => unawaited(cubit.load()),
            ),
            CollabLoad.loaded => _BoardShareBody(state: state),
          },
        );
      },
    );
  }
}

class _BoardShareBody extends StatefulWidget {
  const _BoardShareBody({required this.state});

  final SharingState<BoardPublicLink> state;

  @override
  State<_BoardShareBody> createState() => _BoardShareBodyState();
}

class _BoardShareBodyState extends State<_BoardShareBody> {
  /// The permission a new guest gets; web defaults to view.
  SharePermission _invitePermission = SharePermission.view;

  Future<void> _run(
    Future<CollabFailure?> Function() change, {
    required String fallback,
    String? success,
  }) async {
    final failure = await change();
    if (!mounted) return;
    showCollabResult(context, failure, fallback: fallback, success: success);
  }

  Future<void> _pickInvitePermission() async {
    final l10n = context.l10n;
    final picked = await showAppSelectSheet<SharePermission>(
      context: context,
      title: l10n.boardShareGuestsTitle,
      value: _invitePermission,
      options: [
        AppSelectOption(
          value: SharePermission.view,
          label: l10n.boardShareCanView,
        ),
        AppSelectOption(
          value: SharePermission.edit,
          label: l10n.boardShareCanEdit,
        ),
      ],
    );
    if (picked != null && mounted) {
      setState(() => _invitePermission = picked.value);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    final cubit = context.read<BoardSharingCubit>();
    final state = widget.state;
    final url = cubit.publicUrl;
    final enabled = !state.busy;
    final muted = tokens.typography.small.copyWith(
      color: tokens.colorScheme.mutedForeground,
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: AppLayout.sectionGap,
      children: [
        CollabSection(
          title: l10n.boardSharePublicTitle,
          child: AppCard(
            padding: const EdgeInsets.all(AppSpacing.md),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              spacing: AppSpacing.sm,
              children: [
                Text(l10n.boardSharePublicDescription, style: muted),
                if (url == null)
                  AppButton.primary(
                    key: const ValueKey('board-share-public-enable'),
                    loading: state.busy,
                    onPressed: enabled
                        ? () => unawaited(
                            _run(
                              cubit.enablePublicLink,
                              fallback: l10n.taskShareFailed,
                              success: l10n.boardSharePublicEnabled,
                            ),
                          )
                        : null,
                    leading: const Icon(LucideIcons.globe, size: 16),
                    child: Text(l10n.boardSharePublicEnable),
                  )
                else ...[
                  ShareLinkActions(
                    url: url,
                    copiedMessage: l10n.boardSharePublicCopied,
                    enabled: enabled,
                  ),
                  AppButton.ghost(
                    key: const ValueKey('board-share-public-disable'),
                    onPressed: enabled
                        ? () => unawaited(
                            _run(
                              cubit.disablePublicLink,
                              fallback: l10n.taskShareFailed,
                              success: l10n.boardSharePublicDisabled,
                            ),
                          )
                        : null,
                    child: Text(
                      l10n.boardSharePublicDisable,
                      style: TextStyle(color: tokens.colorScheme.destructive),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
        CollabSection(
          title: l10n.boardShareGuestsTitle,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            spacing: AppSpacing.sm,
            children: [
              Text(l10n.boardShareGuestsDescription, style: muted),
              ShareInviteField(
                placeholder: l10n.boardShareEmailPlaceholder,
                enabled: enabled,
                busy: state.busy,
                trailing: AppButton.outline(
                  key: const ValueKey('board-share-invite-permission'),
                  size: AppButtonSize.small,
                  onPressed: enabled
                      ? () => unawaited(_pickInvitePermission())
                      : null,
                  trailing: const Icon(LucideIcons.chevronDown, size: 14),
                  child: Text(
                    _invitePermission == SharePermission.edit
                        ? l10n.boardShareCanEdit
                        : l10n.boardShareCanView,
                  ),
                ),
                onInvite: (email) async {
                  final failure = await cubit.addGuest(
                    email,
                    _invitePermission,
                  );
                  if (!context.mounted) return false;
                  showCollabResult(
                    context,
                    failure,
                    fallback: failure == CollabFailure.invalid
                        ? l10n.taskShareInvalidEmail
                        : l10n.taskShareFailed,
                    success: l10n.boardShareSaved,
                  );
                  return failure == null;
                },
              ),
              if (state.shares.isEmpty)
                CollabStatus.empty(l10n.boardShareEmpty)
              else
                ShareGrantList(
                  shares: state.shares,
                  enabled: enabled,
                  viewLabel: l10n.boardShareCanView,
                  editLabel: l10n.boardShareCanEdit,
                  onPermission: (share, permission) => unawaited(
                    _run(
                      () => cubit.setPermission(share.id, permission),
                      fallback: l10n.taskShareFailed,
                      success: l10n.boardShareSaved,
                    ),
                  ),
                  onRemove: (share) => unawaited(
                    _run(
                      () => cubit.removeGuest(share.id),
                      fallback: l10n.taskShareFailed,
                      success: l10n.boardShareRemoved,
                    ),
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }
}
