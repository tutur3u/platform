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
    final toastContext = Navigator.of(context, rootNavigator: true).context;
    if (!toastContext.mounted) return;
    shad.showToast(
      context: toastContext,
      builder: (context, overlay) => shad.SurfaceCard(
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Text(
            message,
            style: TextStyle(
              color: shad.Theme.of(context).colorScheme.destructive,
            ),
          ),
        ),
      ),
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
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.only(
          left: 16,
          right: 16,
          top: 16,
          bottom: 16 + MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                widget.initialUser == null
                    ? l10n.crmCreateUser
                    : l10n.commonEdit,
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  CircleAvatar(
                    radius: 28,
                    backgroundImage: avatarImage ?? fallbackImage,
                    child: avatarImage == null && fallbackImage == null
                        ? Text(avatarLabel)
                        : null,
                  ),
                  const SizedBox(width: 12),
                  FilledButton.tonalIcon(
                    onPressed: widget.canEdit ? _pickAvatar : null,
                    icon: const Icon(Icons.image_outlined),
                    label: Text(l10n.crmUploadAvatar),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              TextField(
                controller: _fullNameController,
                decoration: InputDecoration(labelText: l10n.crmFullName),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _displayNameController,
                decoration: InputDecoration(labelText: l10n.crmDisplayName),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _emailController,
                decoration: InputDecoration(labelText: l10n.emailLabel),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _phoneController,
                decoration: InputDecoration(labelText: l10n.crmPhone),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _addressController,
                decoration: InputDecoration(labelText: l10n.crmAddress),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _noteController,
                minLines: 3,
                maxLines: 5,
                decoration: InputDecoration(labelText: l10n.crmNote),
              ),
              const SizedBox(height: 12),
              SwitchListTile(
                value: _isGuest,
                onChanged: (value) => setState(() => _isGuest = value),
                title: Text(l10n.crmGuestUser),
              ),
              SwitchListTile(
                value: _archived,
                onChanged: (value) => setState(() => _archived = value),
                title: Text(l10n.crmArchived),
              ),
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(l10n.crmBirthday),
                subtitle: Text(
                  _birthday == null
                      ? l10n.commonSelectDate
                      : DateFormat.yMMMd().format(_birthday!),
                ),
                onTap: () async {
                  final picked = await showDatePicker(
                    context: context,
                    initialDate: _birthday ?? DateTime.now(),
                    firstDate: DateTime(1900),
                    lastDate: DateTime.now(),
                  );
                  if (picked != null) setState(() => _birthday = picked);
                },
              ),
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(l10n.crmArchivedUntil),
                subtitle: Text(
                  _archivedUntil == null
                      ? l10n.commonSelectDate
                      : DateFormat.yMMMd().format(_archivedUntil!),
                ),
                onTap: () async {
                  final picked = await showDatePicker(
                    context: context,
                    initialDate: _archivedUntil ?? DateTime.now(),
                    firstDate: DateTime.now(),
                    lastDate: DateTime.now().add(const Duration(days: 3650)),
                  );
                  if (picked != null) setState(() => _archivedUntil = picked);
                },
              ),
              const SizedBox(height: 16),
              FilledButton(
                onPressed: _saving || !widget.canEdit ? null : _submit,
                child: _saving
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: NovaLoadingIndicator(size: 20),
                      )
                    : Text(l10n.commonSave),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
