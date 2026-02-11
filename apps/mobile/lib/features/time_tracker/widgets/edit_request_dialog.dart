import 'dart:async';

import 'package:flutter/material.dart'
    hide AlertDialog, FilledButton, OutlinedButton, TextField;
import 'package:image_picker/image_picker.dart';
import 'package:mobile/data/models/time_tracking/request.dart';
import 'package:mobile/features/time_tracker/widgets/request_image_editor.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class EditRequestDialog extends StatefulWidget {
  const EditRequestDialog({
    required this.request,
    required this.onSave,
    super.key,
  });

  final TimeTrackingRequest request;
  final Future<TimeTrackingRequest?> Function(
    String title,
    DateTime startTime,
    DateTime endTime, {
    String? description,
    List<String>? removedImages,
    List<String>? newImagePaths,
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

    return shad.AlertDialog(
      barrierColor: Colors.transparent,
      title: Text(l10n.timerRequestEditRequest),
      content: SizedBox(
        width: double.maxFinite,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(l10n.timerSessionTitle, style: theme.typography.small),
              const shad.Gap(4),
              shad.TextField(
                controller: _titleController,
                placeholder: Text(l10n.timerSessionTitle),
              ),
              const shad.Gap(16),
              Text(l10n.timerRequestDescription, style: theme.typography.small),
              const shad.Gap(4),
              shad.TextField(
                controller: _descriptionController,
                maxLines: 3,
                placeholder: Text(l10n.timerRequestDescriptionOptional),
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
                initialImages: widget.request.images,
                onChanged: (result) {
                  _removedImages = result.removedExistingImages;
                  _newImages = result.newImages;
                },
              ),
            ],
          ),
        ),
      ),
      actions: [
        shad.OutlineButton(
          onPressed: _isSaving ? null : () => Navigator.of(context).pop(),
          child: Text(l10n.profileCancel),
        ),
        shad.PrimaryButton(
          onPressed: _isSaving ? null : _handleSave,
          child: _isSaving
              ? const SizedBox(
                  width: 16,
                  height: 16,
                  child: shad.CircularProgressIndicator(),
                )
              : Text(l10n.timerSave),
        ),
      ],
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

    setState(() => _isSaving = true);

    try {
      await widget.onSave(
        title,
        _startTime,
        _endTime,
        description: _descriptionController.text.trim().isEmpty
            ? null
            : _descriptionController.text.trim(),
        removedImages: _removedImages,
        newImagePaths: _newImages.map((image) => image.path).toList(),
      );

      if (!mounted) return;
      Navigator.of(context).pop();
    } on Exception {
      if (!mounted) return;
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
