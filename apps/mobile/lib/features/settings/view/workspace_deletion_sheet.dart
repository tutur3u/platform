import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/workspace_deletion_repository.dart';
import 'package:mobile/l10n/l10n.dart';

/// Owner-only deletion with typed confirmation of the workspace name.
/// Resolves `true` once the server deleted the workspace.
Future<bool> showWorkspaceDeletionSheet({
  required BuildContext context,
  required Workspace workspace,
  WorkspaceDeletionRepository? repository,
}) async {
  final deleted = await showAppSheet<bool>(
    context: context,
    builder: (_) => WorkspaceDeletionSheet(
      workspace: workspace,
      repository: repository ?? WorkspaceDeletionRepository(),
    ),
  );
  return deleted ?? false;
}

class WorkspaceDeletionSheet extends StatefulWidget {
  const WorkspaceDeletionSheet({
    required this.workspace,
    required this.repository,
    super.key,
  });

  final Workspace workspace;
  final WorkspaceDeletionRepository repository;

  @override
  State<WorkspaceDeletionSheet> createState() => _WorkspaceDeletionSheetState();
}

class _WorkspaceDeletionSheetState extends State<WorkspaceDeletionSheet> {
  final _controller = TextEditingController();
  WorkspaceDeletionStatus? _status;
  bool _deleting = false;
  String? _fieldError;
  WorkspaceDeletionStatus? _failure;

  String get _name => widget.workspace.name?.trim() ?? '';
  bool get _matches => _name.isNotEmpty && _controller.text.trim() == _name;

  @override
  void initState() {
    super.initState();
    unawaited(_loadStatus());
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _loadStatus() async {
    setState(() {
      _status = null;
      _failure = null;
    });
    final status = await widget.repository.getStatus(widget.workspace.id);
    if (mounted) setState(() => _status = status);
  }

  Future<void> _delete() async {
    if (!_matches) return;
    setState(() {
      _deleting = true;
      _fieldError = null;
      _failure = null;
    });
    try {
      await widget.repository.delete(
        wsId: widget.workspace.id,
        confirmation: _controller.text,
      );
      if (mounted) Navigator.of(context).pop(true);
    } on WorkspaceDeletionException catch (error) {
      if (!mounted) return;
      setState(() {
        _deleting = false;
        if (error.confirmationMismatch ?? false) {
          _fieldError = context.l10n.settingsWorkspaceDeleteMismatch;
        } else {
          _failure = error.status;
        }
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final ready = _status == WorkspaceDeletionStatus.ready;
    return PopScope(
      canPop: !_deleting,
      child: AppSheetScaffold(
        title: l10n.settingsWorkspaceDeleteTitle,
        icon: LucideIcons.trash2,
        actions: [
          AppButton.ghost(
            onPressed: _deleting
                ? null
                : () => Navigator.of(context).pop(false),
            child: Text(l10n.commonCancel),
          ),
          if (ready)
            AppButton.destructive(
              key: const ValueKey('workspace-delete-confirm'),
              loading: _deleting,
              onPressed: _matches && !_deleting
                  ? () => unawaited(_delete())
                  : null,
              child: Text(l10n.settingsWorkspaceDeleteAction),
            ),
        ],
        child: _body(context),
      ),
    );
  }

  Widget _body(BuildContext context) {
    final l10n = context.l10n;
    final status = _status;
    if (status == null) return const AppSkeletonRows();
    if (status != WorkspaceDeletionStatus.ready) {
      return _BlockedMessage(status: status, onRetry: _loadStatus);
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        AppAlert.destructive(
          leading: const Icon(LucideIcons.triangleAlert),
          title: Text(l10n.settingsWorkspaceDeleteWarningTitle),
          content: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              for (final consequence in [
                l10n.settingsWorkspaceDeleteConsequenceData(_name),
                l10n.settingsWorkspaceDeleteConsequenceMembers,
                l10n.settingsWorkspaceDeleteConsequenceFinal,
              ])
                Padding(
                  padding: const EdgeInsets.only(top: AppSpacing.xs),
                  child: Text('• $consequence'),
                ),
            ],
          ),
        ),
        const SizedBox(height: AppLayout.sectionGap),
        AppTextField(
          key: const ValueKey('workspace-delete-name'),
          controller: _controller,
          label: l10n.settingsWorkspaceDeleteConfirmLabel(_name),
          placeholder: _name,
          errorText: _fieldError,
          enabled: !_deleting,
          autofillHints: const [],
          onChanged: (_) => setState(() => _fieldError = null),
          onSubmitted: (_) => unawaited(_delete()),
        ),
        if (_failure case final failure?) ...[
          const SizedBox(height: AppSpacing.md),
          AppAlert.destructive(
            content: Text(workspaceDeletionMessage(context, failure)),
          ),
        ],
      ],
    );
  }
}

/// Friendly copy for a state that blocks or failed a deletion.
String workspaceDeletionMessage(
  BuildContext context,
  WorkspaceDeletionStatus status,
) {
  final l10n = context.l10n;
  return switch (status) {
    WorkspaceDeletionStatus.protected => l10n.settingsWorkspaceDeleteProtected,
    WorkspaceDeletionStatus.subscriptionActive =>
      l10n.settingsWorkspaceDeleteSubscription,
    WorkspaceDeletionStatus.forbidden => l10n.settingsWorkspaceDeleteOwnerOnly,
    WorkspaceDeletionStatus.notFound => l10n.settingsWorkspaceDeleteNotFound,
    WorkspaceDeletionStatus.unavailable ||
    WorkspaceDeletionStatus.ready => l10n.settingsWorkspaceDeleteUnavailable,
  };
}

class _BlockedMessage extends StatelessWidget {
  const _BlockedMessage({required this.status, required this.onRetry});

  final WorkspaceDeletionStatus status;
  final Future<void> Function() onRetry;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final retryable = status == WorkspaceDeletionStatus.unavailable;
    return AppStateMessage.inline(
      icon: switch (status) {
        WorkspaceDeletionStatus.protected => LucideIcons.lock,
        WorkspaceDeletionStatus.subscriptionActive => LucideIcons.creditCard,
        WorkspaceDeletionStatus.forbidden => LucideIcons.shieldAlert,
        _ => LucideIcons.cloudOff,
      },
      tone: retryable ? AppTone.neutral : AppTone.warning,
      title: workspaceDeletionMessage(context, status),
      actionLabel: retryable ? l10n.commonRetry : null,
      onAction: retryable ? () => unawaited(onRetry()) : null,
    );
  }
}
