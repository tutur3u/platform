part of 'crm_page.dart';

class _UserFormSheet extends StatefulWidget {
  const _UserFormSheet({
    required this.wsId,
    required this.repository,
    required this.onSubmit,
    required this.canEdit,
    this.initialUser,
  });

  final String wsId;
  final CrmRepository repository;
  final CrmUser? initialUser;
  final bool canEdit;
  final Future<void> Function(Map<String, dynamic>) onSubmit;

  @override
  State<_UserFormSheet> createState() => _UserFormSheetState();
}

class _UserFormSheetState extends State<_UserFormSheet> {
  late final TextEditingController _fullNameController;
  late final TextEditingController _displayNameController;
  late final TextEditingController _emailController;
  late final TextEditingController _phoneController;
  late final TextEditingController _addressController;
  late final TextEditingController _noteController;
  bool _isGuest = false;
  bool _archived = false;
  DateTime? _birthday;
  DateTime? _archivedUntil;
  XFile? _avatarFile;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _fullNameController = TextEditingController(
      text: widget.initialUser?.fullName ?? '',
    );
    _displayNameController = TextEditingController(
      text: widget.initialUser?.displayName ?? '',
    );
    _emailController = TextEditingController(
      text: widget.initialUser?.email ?? '',
    );
    _phoneController = TextEditingController(
      text: widget.initialUser?.phone ?? '',
    );
    _addressController = TextEditingController(
      text: widget.initialUser?.address ?? '',
    );
    _noteController = TextEditingController(
      text: widget.initialUser?.note ?? '',
    );
    _isGuest = widget.initialUser?.isGuest ?? false;
    _archived = widget.initialUser?.archived ?? false;
    _birthday = widget.initialUser?.birthday == null
        ? null
        : DateTime.tryParse(widget.initialUser!.birthday!);
    _archivedUntil = widget.initialUser?.archivedUntil == null
        ? null
        : DateTime.tryParse(widget.initialUser!.archivedUntil!);
  }

  @override
  void dispose() {
    _fullNameController.dispose();
    _displayNameController.dispose();
    _emailController.dispose();
    _phoneController.dispose();
    _addressController.dispose();
    _noteController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() => _saving = true);
    try {
      var avatarUrl = widget.initialUser?.avatarUrl;
      if (_avatarFile != null) {
        final bytes = await _avatarFile!.readAsBytes();
        final contentType =
            lookupMimeType(
              _avatarFile!.name,
              headerBytes: bytes.take(12).toList(),
            ) ??
            'image/jpeg';
        avatarUrl = await widget.repository.uploadAvatar(
          widget.wsId,
          fileName: _avatarFile!.name,
          contentType: contentType,
          bytes: bytes,
        );
      }

      await widget.onSubmit({
        'full_name': _fullNameController.text.trim(),
        'display_name': _displayNameController.text.trim(),
        'email': _emailController.text.trim().isEmpty
            ? null
            : _emailController.text.trim(),
        'phone': _phoneController.text.trim().isEmpty
            ? null
            : _phoneController.text.trim(),
        'address': _addressController.text.trim().isEmpty
            ? null
            : _addressController.text.trim(),
        'note': _noteController.text.trim().isEmpty
            ? null
            : _noteController.text.trim(),
        'birthday': _birthday?.toIso8601String(),
        'is_guest': _isGuest,
        'archived': _archived,
        'archived_until': _archivedUntil?.toIso8601String(),
        'avatar_url': avatarUrl,
      });
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } on ApiException catch (error) {
      if (!mounted) return;
      _showError(error.message);
    } on Object catch (_) {
      if (mounted) _showError(context.l10n.commonSomethingWentWrong);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  void _showError(String message) {
    if (!mounted) return;
    showAppToast(
      context,
      message: message,
      variant: AppAlertVariant.destructive,
    );
  }

  Future<void> _pickAvatar() async {
    final picker = ImagePicker();
    final selected = await picker.pickImage(
      source: ImageSource.gallery,
      imageQuality: 85,
      maxWidth: 1200,
    );
    if (selected == null || !mounted) return;
    setState(() => _avatarFile = selected);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final avatarLabelSource =
        (widget.initialUser?.label ?? _fullNameController.text.trim()).trim();
    final avatarLabel = avatarLabelSource.isEmpty
        ? '?'
        : avatarLabelSource.characters.first.toUpperCase();
    final avatarImage = _avatarFile == null
        ? null
        : FileImage(File(_avatarFile!.path)) as ImageProvider<Object>;
    final fallbackImage = widget.initialUser?.avatarUrl == null
        ? null
        : NetworkImage(widget.initialUser!.avatarUrl!);
    final tokens = AppTokens.of(context);
    return SingleChildScrollView(
      padding: const EdgeInsets.all(AppSpacing.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            widget.initialUser == null ? l10n.crmCreateUser : l10n.commonEdit,
            style: tokens.typography.large.copyWith(
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: AppSpacing.lg),
          Row(
            children: [
              CircleAvatar(
                radius: 28,
                backgroundColor: AppTone.info.fill(tokens.colorScheme),
                backgroundImage: avatarImage ?? fallbackImage,
                foregroundColor: AppTone.info.foreground(tokens.colorScheme),
                child: avatarImage == null && fallbackImage == null
                    ? Text(avatarLabel)
                    : null,
              ),
              const SizedBox(width: AppSpacing.md),
              AppButton.outline(
                onPressed: widget.canEdit ? _pickAvatar : null,
                leading: const Icon(LucideIcons.image),
                child: Text(l10n.crmUploadAvatar),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.lg),
          AppTextField(
            controller: _fullNameController,
            label: l10n.crmFullName,
            placeholder: l10n.inputPlaceholderFullName,
          ),
          const SizedBox(height: AppSpacing.md),
          AppTextField(
            controller: _displayNameController,
            label: l10n.crmDisplayName,
            placeholder: l10n.inputPlaceholderDisplayName,
          ),
          const SizedBox(height: AppSpacing.md),
          AppTextField(
            controller: _emailController,
            label: l10n.emailLabel,
            placeholder: l10n.profileEmailHint,
            keyboardType: TextInputType.emailAddress,
          ),
          const SizedBox(height: AppSpacing.md),
          AppTextField(
            controller: _phoneController,
            label: l10n.crmPhone,
            placeholder: l10n.inputPlaceholderPhone,
            keyboardType: TextInputType.phone,
          ),
          const SizedBox(height: AppSpacing.md),
          AppTextField(
            controller: _addressController,
            label: l10n.crmAddress,
            placeholder: l10n.inputPlaceholderAddress,
          ),
          const SizedBox(height: AppSpacing.md),
          AppTextField(
            controller: _noteController,
            label: l10n.crmNote,
            placeholder: l10n.inputPlaceholderNote,
            minLines: 3,
            maxLines: 5,
          ),
          const SizedBox(height: AppSpacing.md),
          AppToggleRow(
            value: _isGuest,
            onChanged: (value) => setState(() => _isGuest = value),
            title: Text(l10n.crmGuestUser),
          ),
          AppToggleRow(
            value: _archived,
            onChanged: (value) => setState(() => _archived = value),
            title: Text(l10n.crmArchived),
          ),
          AppGroupedRow(
            title: Text(l10n.crmBirthday),
            subtitle: Text(
              _birthday == null
                  ? l10n.commonSelectDate
                  : DateFormat.yMMMd().format(_birthday!),
            ),
            onTap: () async {
              final picked = await showAppDatePicker(
                context: context,
                initialDate: _birthday ?? DateTime.now(),
                firstDate: DateTime(1900),
                lastDate: DateTime.now(),
              );
              if (picked != null) setState(() => _birthday = picked);
            },
          ),
          AppGroupedRow(
            title: Text(l10n.crmArchivedUntil),
            subtitle: Text(
              _archivedUntil == null
                  ? l10n.commonSelectDate
                  : DateFormat.yMMMd().format(_archivedUntil!),
            ),
            onTap: () async {
              final picked = await showAppDatePicker(
                context: context,
                initialDate: _archivedUntil ?? DateTime.now(),
                firstDate: DateTime.now(),
                lastDate: DateTime.now().add(const Duration(days: 3650)),
              );
              if (picked != null) setState(() => _archivedUntil = picked);
            },
          ),
          const SizedBox(height: AppSpacing.lg),
          AppButton.primary(
            loading: _saving,
            onPressed: !widget.canEdit || _saving ? null : _submit,
            child: Text(l10n.commonSave),
          ),
        ],
      ),
    );
  }
}
