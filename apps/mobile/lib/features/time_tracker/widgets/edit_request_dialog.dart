import 'dart:async';

import 'package:flutter/material.dart'
    hide AlertDialog, FilledButton, OutlinedButton, TextField;
import 'package:image_picker/image_picker.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/data/models/time_tracking/request.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/time_tracker/widgets/request_image_editor.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class EditRequestDialog extends StatefulWidget {
  const EditRequestDialog({
    required this.wsId,
    required this.request,
    required this.onSave,
    super.key,
  });

  final String wsId;

  final TimeTrackingRequest request;
  final Future<TimeTrackingRequest?> Function(
    String title,
    DateTime startTime,
    DateTime endTime, {
    String? description,
    List<String>? removedImages,
    List<String>? newImageLocalPaths,
  })
  onSave;

  @override
  State<EditRequestDialog> createState() => _EditRequestDialogState();
}

class _EditRequestDialogState extends State<EditRequestDialog> {
  late final TextEditingController _titleController;
  late final TextEditingController _descriptionController;
  late DateTime _startTime;
  late DateTime _endTime;
  bool _isSaving = false;
  List<String> _removedImages = const [];
  List<XFile> _newImages = const [];

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);
    final bottomInset = MediaQuery.viewInsetsOf(context).bottom;

    // Single scrollable column + viewInsets padding keeps fields and actions
    // above the software keyboard (AlertDialog actions stay outside the scroll
    // region and were clipped by the keyboard on compact sheets).
    return Container(
      width: double.maxFinite,
      constraints: const BoxConstraints(maxWidth: 560),
      decoration: BoxDecoration(
        color: theme.colorScheme.background,
        borderRadius: context.isCompact
            ? const BorderRadius.vertical(top: Radius.circular(16))
            : BorderRadius.circular(12),
      ),
      child: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(24, 16, 24, bottomInset + 24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            if (context.isCompact) ...[
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: theme.colorScheme.mutedForeground.withValues(
                      alpha: 0.4,
                    ),
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const shad.Gap(16),
            ],
            Text(
              l10n.timerRequestEditRequest,
              style: theme.typography.h4.copyWith(fontWeight: FontWeight.w600),
            ),
            const shad.Gap(16),
            Text(l10n.timerSessionTitle, style: theme.typography.small),
            const shad.Gap(4),
            shad.TextField(
              controller: _titleController,
              hintText: l10n.timerSessionTitle,
            ),
            const shad.Gap(16),
            Text(l10n.timerRequestDescription, style: theme.typography.small),
            const shad.Gap(4),
            shad.TextField(
              controller: _descriptionController,
              maxLines: 3,
              hintText: l10n.timerRequestDescriptionOptional,
            ),
            const shad.Gap(16),
            Text(l10n.timerStartTime, style: theme.typography.small),
            const shad.Gap(4),
            shad.OutlineButton(
              onPressed: () => _pickDateTime(
                context,
                _startTime,
                (dt) => setState(() => _startTime = dt),
              ),
              child: Text(_formatDateTime(_startTime)),
            ),
            const shad.Gap(16),
            Text(l10n.timerEndTime, style: theme.typography.small),
            const shad.Gap(4),
            shad.OutlineButton(
              onPressed: () => _pickDateTime(
                context,
                _endTime,
                (dt) => setState(() => _endTime = dt),
              ),
              child: Text(_formatDateTime(_endTime)),
            ),
            const shad.Gap(16),
            RequestImageEditor(
              wsId: widget.wsId,
              requestId: widget.request.id,
              initialImages: widget.request.images,
              onChanged: (result) {
                _removedImages = result.removedExistingImages;
                _newImages = result.newImages;
              },
            ),
            const shad.Gap(16),
            Row(
              children: [
                Expanded(
                  child: shad.OutlineButton(
                    onPressed: _isSaving
                        ? null
                        : () => Navigator.of(context).pop(),
                    child: Text(l10n.profileCancel),
                  ),
                ),
                const shad.Gap(8),
                Expanded(
                  child: shad.PrimaryButton(
                    onPressed: _isSaving ? null : _handleSave,
                    child: _isSaving
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child: shad.CircularProgressIndicator(),
                          )
                        : Text(l10n.timerSave),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  @override
  void dispose() {
    _titleController.dispose();
    _descriptionController.dispose();
    super.dispose();
  }

  @override
  void initState() {
    super.initState();
    _titleController = TextEditingController(text: widget.request.title);
    _descriptionController = TextEditingController(
      text: widget.request.description,
    );
    _startTime = widget.request.startTime ?? DateTime.now();
    _endTime = widget.request.endTime ?? DateTime.now();
  }

  String _formatDateTime(DateTime dt) {
    final local = dt.toLocal();
    return '${local.month}/${local.day}/${local.year} '
        '${local.hour.toString().padLeft(2, '0')}:'
        '${local.minute.toString().padLeft(2, '0')}';
  }

  Future<void> _handleSave() async {
    final title = _titleController.text.trim();
    if (title.isEmpty) {
      return;
    }

    final toastContext = Navigator.of(context, rootNavigator: true).context;
    setState(() => _isSaving = true);

    try {
      final updatedRequest = await widget.onSave(
        title,
        _startTime,
        _endTime,
        description: _descriptionController.text.trim().isEmpty
            ? null
            : _descriptionController.text.trim(),
        removedImages: _removedImages,
        newImageLocalPaths: _newImages.map((image) => image.path).toList(),
      );

      if (!mounted) {
        return;
      }

      if (updatedRequest == null) {
        if (toastContext.mounted) {
          shad.showToast(
            context: toastContext,
            builder: (context, overlay) => shad.Alert.destructive(
              title: Text(context.l10n.commonSomethingWentWrong),
              content: Text(context.l10n.commonSomethingWentWrong),
            ),
          );
        }
        setState(() => _isSaving = false);
        return;
      }

      await Navigator.maybePop(context);
      if (!toastContext.mounted) {
        return;
      }

      shad.showToast(
        context: toastContext,
        builder: (context, overlay) => shad.Alert(
          title: Text(context.l10n.timerRequestUpdated),
        ),
      );
    } on ApiException catch (e) {
      if (!mounted) {
        return;
      }
      final message = e.message.trim().isNotEmpty
          ? e.message.trim()
          : toastContext.l10n.commonSomethingWentWrong;
      if (toastContext.mounted) {
        shad.showToast(
          context: toastContext,
          builder: (context, overlay) => shad.Alert.destructive(
            title: Text(context.l10n.commonSomethingWentWrong),
            content: Text(message),
          ),
        );
      }
      setState(() => _isSaving = false);
    } on Exception catch (e) {
      if (!mounted) {
        return;
      }
      final message = e.toString().trim();
      if (toastContext.mounted) {
        shad.showToast(
          context: toastContext,
          builder: (context, overlay) => shad.Alert.destructive(
            title: Text(context.l10n.commonSomethingWentWrong),
            content: Text(
              message.isNotEmpty
                  ? message
                  : context.l10n.commonSomethingWentWrong,
            ),
          ),
        );
      }
      setState(() => _isSaving = false);
    }
  }

  Future<void> _pickDateTime(
    BuildContext context,
    DateTime initial,
    ValueChanged<DateTime> onChanged,
  ) async {
    final date = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(2020),
      lastDate: DateTime(2100),
    );

    if (date == null || !context.mounted) return;

    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(initial),
    );

    if (time == null) return;

    onChanged(
      DateTime(
        date.year,
        date.month,
        date.day,
        time.hour,
        time.minute,
      ),
    );
  }
}
