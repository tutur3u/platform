import 'dart:async';

import 'package:flutter/material.dart' hide Card;
import 'package:intl/intl.dart';
import 'package:mobile/data/models/task_project_update.dart';
import 'package:mobile/data/repositories/task_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/async_delete_confirmation_dialog.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class TaskProjectUpdatesSection extends StatefulWidget {
  const TaskProjectUpdatesSection({
    required this.workspaceId,
    required this.projectId,
    required this.currentUserId,
    required this.taskRepository,
    super.key,
  });

  final String workspaceId;
  final String projectId;
  final String currentUserId;
  final TaskRepository taskRepository;

  @override
  State<TaskProjectUpdatesSection> createState() =>
      _TaskProjectUpdatesSectionState();
}

class _TaskProjectUpdatesSectionState extends State<TaskProjectUpdatesSection> {
  late final TextEditingController _newUpdateController;
  late final TextEditingController _editUpdateController;

  List<TaskProjectUpdate> _updates = const [];
  bool _isLoading = true;
  bool _isPosting = false;
  bool _isSavingEdit = false;
  String? _editingId;
  String? _deletingId;
  int _requestToken = 0;

  @override
  void initState() {
    super.initState();
    _newUpdateController = TextEditingController();
    _editUpdateController = TextEditingController();
    unawaited(_loadUpdates());
  }

  @override
  void didUpdateWidget(covariant TaskProjectUpdatesSection oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.workspaceId != widget.workspaceId ||
        oldWidget.projectId != widget.projectId) {
      _editingId = null;
      _editUpdateController.clear();
      _newUpdateController.clear();
      _updates = const [];
      _isLoading = true;
      unawaited(_loadUpdates());
    }
  }

  @override
  void dispose() {
    _newUpdateController.dispose();
    _editUpdateController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return shad.Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            context.l10n.taskPortfolioProjectUpdates,
            style: theme.typography.large.copyWith(fontWeight: FontWeight.w600),
          ),
          const shad.Gap(10),
          shad.TextArea(
            controller: _newUpdateController,
            placeholder: Text(context.l10n.taskPortfolioUpdatePlaceholder),
            enabled: !_isPosting,
            minHeight: 88,
            maxHeight: 160,
            initialHeight: 88,
          ),
          const shad.Gap(8),
          Align(
            alignment: Alignment.centerRight,
            child: shad.PrimaryButton(
              onPressed: _isPosting ? null : _createUpdate,
              child: Text(
                _isPosting
                    ? context.l10n.taskPortfolioPostingUpdate
                    : context.l10n.taskPortfolioPostUpdate,
              ),
            ),
          ),
          const shad.Gap(12),
          if (_isLoading)
            const Center(child: shad.CircularProgressIndicator())
          else if (_updates.isEmpty)
            Text(
              context.l10n.taskPortfolioNoProjectUpdates,
              style: theme.typography.textMuted,
            )
          else
            ..._updates.map((update) => _buildUpdateCard(context, update)),
        ],
      ),
    );
  }

  Widget _buildUpdateCard(BuildContext context, TaskProjectUpdate update) {
    final theme = shad.Theme.of(context);
    final isOwn = update.creatorId == widget.currentUserId;
    final isEditing = _editingId == update.id;
    final isDeleting = _deletingId == update.id;

    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Container(
        padding: const EdgeInsets.fromLTRB(10, 10, 10, 8),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: theme.colorScheme.border.withValues(alpha: 0.9),
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    update.creator?.displayName?.trim().isNotEmpty == true
                        ? update.creator!.displayName!.trim()
                        : context.l10n.taskPortfolioUnknownUser,
                    style: theme.typography.small.copyWith(
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                Text(
                  DateFormat.yMMMd().add_Hm().format(
                    update.createdAt.toLocal(),
                  ),
                  style: theme.typography.xSmall.copyWith(
                    color: theme.colorScheme.mutedForeground,
                  ),
                ),
                if (update.isEdited) ...[
                  const shad.Gap(6),
                  shad.OutlineBadge(
                    child: Text(context.l10n.taskPortfolioUpdateEdited),
                  ),
                ],
              ],
            ),
            const shad.Gap(8),
            if (isEditing)
              shad.TextArea(
                controller: _editUpdateController,
                enabled: !_isSavingEdit,
                minHeight: 80,
                maxHeight: 160,
                initialHeight: 80,
              )
            else
              Text(update.content),
            const shad.Gap(8),
            Row(
              children: [
                if (isOwn && isEditing) ...[
                  shad.OutlineButton(
                    onPressed: _isSavingEdit ? null : _cancelEdit,
                    child: Text(context.l10n.commonCancel),
                  ),
                  const shad.Gap(8),
                  shad.PrimaryButton(
                    onPressed: _isSavingEdit
                        ? null
                        : () => _saveEdit(update.id),
                    child: Text(context.l10n.timerSave),
                  ),
                ] else if (isOwn) ...[
                  shad.GhostButton(
                    onPressed: isDeleting ? null : () => _startEdit(update),
                    child: Text(context.l10n.taskPortfolioEditUpdate),
                  ),
                  const shad.Gap(4),
                  shad.GhostButton(
                    onPressed: isDeleting
                        ? null
                        : () => _deleteUpdate(update.id),
                    child: Text(context.l10n.taskPortfolioDeleteUpdate),
                  ),
                ],
                if (isDeleting) ...[
                  const shad.Gap(8),
                  const shad.SizedBox(
                    width: 16,
                    height: 16,
                    child: shad.CircularProgressIndicator(),
                  ),
                ],
              ],
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _loadUpdates() async {
    final requestToken = ++_requestToken;
    setState(() => _isLoading = true);

    try {
      final updates = await widget.taskRepository.getTaskProjectUpdates(
        wsId: widget.workspaceId,
        projectId: widget.projectId,
      );

      if (!mounted || requestToken != _requestToken) return;
      setState(() {
        _updates = updates;
        _isLoading = false;
      });
    } on Exception catch (error) {
      if (!mounted || requestToken != _requestToken) return;
      setState(() => _isLoading = false);
      _showErrorToast(_resolveMessage(error));
    }
  }

  Future<void> _createUpdate() async {
    final content = _newUpdateController.text.trim();
    if (content.isEmpty) {
      _showErrorToast(context.l10n.taskPortfolioUpdateCannotBeEmpty);
      return;
    }

    setState(() => _isPosting = true);
    try {
      final created = await widget.taskRepository.createTaskProjectUpdate(
        wsId: widget.workspaceId,
        projectId: widget.projectId,
        content: content,
      );
      if (!mounted) return;
      setState(() {
        _isPosting = false;
        _newUpdateController.clear();
        _updates = [created, ..._updates];
      });
      _showSuccessToast(context.l10n.taskPortfolioUpdatePosted);
    } on Exception catch (error) {
      if (!mounted) return;
      setState(() => _isPosting = false);
      _showErrorToast(_resolveMessage(error));
    }
  }

  void _startEdit(TaskProjectUpdate update) {
    setState(() {
      _editingId = update.id;
      _editUpdateController.text = update.content;
    });
  }

  void _cancelEdit() {
    setState(() {
      _editingId = null;
      _isSavingEdit = false;
      _editUpdateController.clear();
    });
  }

  Future<void> _saveEdit(String updateId) async {
    final content = _editUpdateController.text.trim();
    if (content.isEmpty) {
      _showErrorToast(context.l10n.taskPortfolioUpdateCannotBeEmpty);
      return;
    }

    setState(() => _isSavingEdit = true);
    try {
      final updated = await widget.taskRepository.updateTaskProjectUpdate(
        wsId: widget.workspaceId,
        projectId: widget.projectId,
        updateId: updateId,
        content: content,
      );
      if (!mounted) return;
      setState(() {
        _isSavingEdit = false;
        _editingId = null;
        _editUpdateController.clear();
        _updates = _updates
            .map((item) => item.id == updateId ? updated : item)
            .toList(growable: false);
      });
      _showSuccessToast(context.l10n.taskPortfolioUpdateSaved);
    } on Exception catch (error) {
      if (!mounted) return;
      setState(() => _isSavingEdit = false);
      _showErrorToast(_resolveMessage(error));
    }
  }

  Future<void> _deleteUpdate(String updateId) async {
    final toastContext = Navigator.of(context, rootNavigator: true).context;
    final shouldDelete =
        await shad.showDialog<bool>(
          context: context,
          builder: (_) => AsyncDeleteConfirmationDialog(
            title: context.l10n.taskPortfolioDeleteUpdate,
            message: context.l10n.taskPortfolioDeleteUpdateConfirm,
            cancelLabel: context.l10n.commonCancel,
            confirmLabel: context.l10n.taskPortfolioDeleteUpdate,
            toastContext: toastContext,
            onConfirm: () async {
              setState(() => _deletingId = updateId);
              await widget.taskRepository.deleteTaskProjectUpdate(
                wsId: widget.workspaceId,
                projectId: widget.projectId,
                updateId: updateId,
              );
            },
          ),
        ) ??
        false;

    if (!mounted) return;
    if (!shouldDelete) {
      setState(() => _deletingId = null);
      return;
    }

    setState(() {
      _deletingId = null;
      _updates = _updates.where((item) => item.id != updateId).toList();
      if (_editingId == updateId) {
        _editingId = null;
        _editUpdateController.clear();
      }
    });
    _showSuccessToast(context.l10n.taskPortfolioUpdateDeleted);
  }

  void _showSuccessToast(String message) {
    final toastContext = Navigator.of(context, rootNavigator: true).context;
    if (!toastContext.mounted) return;
    shad.showToast(
      context: toastContext,
      builder: (context, overlay) => shad.Alert(content: Text(message)),
    );
  }

  void _showErrorToast(String message) {
    final toastContext = Navigator.of(context, rootNavigator: true).context;
    if (!toastContext.mounted) return;
    shad.showToast(
      context: toastContext,
      builder: (context, overlay) =>
          shad.Alert.destructive(content: Text(message)),
    );
  }

  String _resolveMessage(Object error) {
    if (error is ApiException) {
      final message = error.message.trim();
      if (message.isNotEmpty) {
        return message;
      }
    }
    return context.l10n.commonSomethingWentWrong;
  }
}
