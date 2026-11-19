part of 'education_page.dart';

class _CourseSheet extends StatefulWidget {
  const _CourseSheet({
    required this.title,
    required this.onSubmit,
    this.initialName,
    this.initialDescription,
  });

  final String title;
  final String? initialName;
  final String? initialDescription;
  final Future<void> Function(String name, String? description) onSubmit;

  @override
  State<_CourseSheet> createState() => _CourseSheetState();
}

class _CourseSheetState extends State<_CourseSheet> {
  late final TextEditingController _nameController;
  late final TextEditingController _descriptionController;
  bool _submitting = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _nameController = TextEditingController(text: widget.initialName);
    _descriptionController = TextEditingController(
      text: widget.initialDescription,
    );
  }

  @override
  void dispose() {
    _nameController.dispose();
    _descriptionController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_nameController.text.trim().isEmpty) return;
    setState(() => _submitting = true);
    try {
      await widget.onSubmit(
        _nameController.text.trim(),
        _descriptionController.text.trim().isEmpty
            ? null
            : _descriptionController.text.trim(),
      );
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } on Object catch (error) {
      if (mounted) {
        setState(
          () => _error = error is ApiException
              ? error.message
              : context.l10n.commonSomethingWentWrong,
        );
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return AppSheetScaffold(
      title: widget.title,
      actions: [
        AppButton.ghost(
          onPressed: _submitting
              ? null
              : () => Navigator.of(context).pop(false),
          child: Text(l10n.commonCancel),
        ),
        AppButton.primary(
          onPressed: _submitting ? null : _submit,
          loading: _submitting,
          child: Text(l10n.commonSave),
        ),
      ],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (_error != null) ...[
            AppAlert.destructive(content: Text(_error!)),
            const SizedBox(height: AppSpacing.md),
          ],
          AppTextField(
            controller: _nameController,
            label: l10n.educationCourseNameLabel,
            placeholder: l10n.inputPlaceholderCourseName,
            textInputAction: TextInputAction.next,
          ),
          const SizedBox(height: AppSpacing.md),
          AppTextField(
            controller: _descriptionController,
            label: l10n.educationCourseDescriptionLabel,
            placeholder: l10n.inputPlaceholderCourseDescription,
            minLines: 3,
            maxLines: 5,
          ),
        ],
      ),
    );
  }
}

class _SimpleEducationSheet extends StatefulWidget {
  const _SimpleEducationSheet({
    required this.title,
    required this.fieldLabel,
    required this.onSubmit,
    this.secondaryLabel,
    this.initialValue,
    this.initialSecondaryValue,
  });

  final String title;
  final String fieldLabel;
  final String? secondaryLabel;
  final String? initialValue;
  final String? initialSecondaryValue;
  final Future<void> Function(String value, String secondaryValue) onSubmit;

  @override
  State<_SimpleEducationSheet> createState() => _SimpleEducationSheetState();
}

class _SimpleEducationSheetState extends State<_SimpleEducationSheet> {
  late final TextEditingController _primaryController;
  late final TextEditingController _secondaryController;
  bool _submitting = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _primaryController = TextEditingController(text: widget.initialValue);
    _secondaryController = TextEditingController(
      text: widget.initialSecondaryValue,
    );
  }

  @override
  void dispose() {
    _primaryController.dispose();
    _secondaryController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_primaryController.text.trim().isEmpty) return;
    if (widget.secondaryLabel != null &&
        _secondaryController.text.trim().isEmpty) {
      return;
    }
    setState(() => _submitting = true);
    try {
      await widget.onSubmit(
        _primaryController.text.trim(),
        _secondaryController.text.trim(),
      );
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } on Object catch (error) {
      if (mounted) {
        setState(
          () => _error = error is ApiException
              ? error.message
              : context.l10n.commonSomethingWentWrong,
        );
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final paired = widget.secondaryLabel != null;
    return AppSheetScaffold(
      title: widget.title,
      actions: [
        AppButton.ghost(
          onPressed: _submitting
              ? null
              : () => Navigator.of(context).pop(false),
          child: Text(l10n.commonCancel),
        ),
        AppButton.primary(
          onPressed: _submitting ? null : _submit,
          loading: _submitting,
          child: Text(l10n.commonSave),
        ),
      ],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (_error != null) ...[
            AppAlert.destructive(content: Text(_error!)),
            const SizedBox(height: AppSpacing.md),
          ],
          AppTextField(
            controller: _primaryController,
            label: widget.fieldLabel,
            placeholder: paired
                ? l10n.inputPlaceholderFlashcardFront
                : l10n.inputPlaceholderQuizSetName,
            minLines: paired ? 2 : 1,
            maxLines: paired ? 4 : 1,
          ),
          if (paired) ...[
            const SizedBox(height: AppSpacing.md),
            AppTextField(
              controller: _secondaryController,
              label: widget.secondaryLabel,
              placeholder: l10n.inputPlaceholderFlashcardBack,
              minLines: 2,
              maxLines: 4,
            ),
          ],
        ],
      ),
    );
  }
}
