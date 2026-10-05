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
    return Padding(
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        top: 16,
        bottom: 16 + MediaQuery.viewInsetsOf(context).bottom,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            widget.title,
            style: shad.Theme.of(
              context,
            ).typography.large.copyWith(fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 16),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Text(
                _error!,
                style: TextStyle(
                  color: shad.Theme.of(context).colorScheme.destructive,
                ),
              ),
            ),
          TextField(
            controller: _nameController,
            decoration: InputDecoration(
              labelText: context.l10n.educationCourseNameLabel,
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _descriptionController,
            minLines: 3,
            maxLines: 5,
            decoration: InputDecoration(
              labelText: context.l10n.educationCourseDescriptionLabel,
            ),
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: TextButton(
                  onPressed: _submitting
                      ? null
                      : () => Navigator.of(context).pop(false),
                  child: Text(context.l10n.commonCancel),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: FilledButton(
                  onPressed: _submitting ? null : _submit,
                  child: Text(context.l10n.commonSave),
                ),
              ),
            ],
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
    return Padding(
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        top: 16,
        bottom: 16 + MediaQuery.viewInsetsOf(context).bottom,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            widget.title,
            style: shad.Theme.of(
              context,
            ).typography.large.copyWith(fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 16),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Text(
                _error!,
                style: TextStyle(
                  color: shad.Theme.of(context).colorScheme.destructive,
                ),
              ),
            ),
          TextField(
            controller: _primaryController,
            minLines: widget.secondaryLabel == null ? 1 : 2,
            maxLines: widget.secondaryLabel == null ? 1 : 4,
            decoration: InputDecoration(labelText: widget.fieldLabel),
          ),
          if (widget.secondaryLabel != null) ...[
            const SizedBox(height: 12),
            TextField(
              controller: _secondaryController,
              minLines: 2,
              maxLines: 4,
              decoration: InputDecoration(labelText: widget.secondaryLabel),
            ),
          ],
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: TextButton(
                  onPressed: _submitting
                      ? null
                      : () => Navigator.of(context).pop(false),
                  child: Text(context.l10n.commonCancel),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: FilledButton(
                  onPressed: _submitting ? null : _submit,
                  child: Text(context.l10n.commonSave),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
