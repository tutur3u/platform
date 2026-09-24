import 'package:flutter/material.dart';
import 'package:mobile/data/repositories/internal_account_repository.dart';
import 'package:mobile/l10n/l10n.dart';

enum InternalAccountEdit {
  profile,
  password,
  access,
  authenticators,
  mfaPolicy,
}

class InternalAccountEditor extends StatefulWidget {
  const InternalAccountEditor({
    required this.account,
    required this.action,
    required this.repository,
    super.key,
  });

  final InternalAccount account;
  final InternalAccountEdit action;
  final InternalAccountRepository repository;

  @override
  State<InternalAccountEditor> createState() => _InternalAccountEditorState();
}

class _InternalAccountEditorState extends State<InternalAccountEditor> {
  final _form = GlobalKey<FormState>();
  final _confirmation = TextEditingController();
  final _password = TextEditingController();
  late final _name = TextEditingController(text: widget.account.displayName);
  late final _username = TextEditingController(text: widget.account.username);
  bool _saving = false;
  bool _failed = false;

  @override
  void dispose() {
    _confirmation.dispose();
    _password.dispose();
    _name.dispose();
    _username.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_saving || !_form.currentState!.validate()) return;
    setState(() {
      _saving = true;
      _failed = false;
    });
    try {
      final updated = switch (widget.action) {
        InternalAccountEdit.mfaPolicy => await widget.repository.setMfaPolicy(
          widget.account,
          required: !widget.account.mfaRequired,
          confirmationEmail: _confirmation.text,
        ),
        InternalAccountEdit.profile => await widget.repository.updateProfile(
          widget.account,
          displayName: _name.text,
          username: _username.text,
        ),
        InternalAccountEdit.password => await widget.repository.resetPassword(
          widget.account,
          password: _password.text,
          confirmationEmail: _confirmation.text,
        ),
        InternalAccountEdit.authenticators =>
          await widget.repository.resetAuthenticators(
            widget.account,
            confirmationEmail: _confirmation.text,
          ),
        InternalAccountEdit.access => await widget.repository.setAccess(
          widget.account,
          enabled: widget.account.isDisabled,
          confirmationEmail: _confirmation.text,
        ),
      };
      _password.clear();
      if (mounted) Navigator.of(context).pop(updated);
    } on Exception {
      if (mounted) setState(() => _failed = true);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final title = switch (widget.action) {
      InternalAccountEdit.mfaPolicy =>
        widget.account.mfaRequired
            ? l10n.adminAccountsOptionalMfa
            : l10n.adminAccountsRequireMfa,
      InternalAccountEdit.profile => l10n.adminAccountsEditProfile,
      InternalAccountEdit.password => l10n.adminAccountsResetPassword,
      InternalAccountEdit.authenticators => l10n.adminAccountsResetMfa,
      InternalAccountEdit.access =>
        widget.account.isDisabled
            ? l10n.adminAccountsEnableAccess
            : l10n.adminAccountsDisableAccess,
    };
    return PopScope(
      canPop: !_saving,
      child: Scaffold(
        appBar: AppBar(title: Text(title)),
        body: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 600),
            child: Form(
              key: _form,
              child: ListView(
                padding: const EdgeInsets.all(20),
                children: [
                  Text(widget.account.email),
                  const SizedBox(height: 20),
                  if (widget.action == InternalAccountEdit.mfaPolicy) ...[
                    Text(l10n.adminAccountsMfaPolicyDescription),
                    const SizedBox(height: 16),
                  ],
                  if (widget.action == InternalAccountEdit.authenticators) ...[
                    Text(l10n.adminAccountsResetMfaDescription),
                    const SizedBox(height: 16),
                  ],
                  if (widget.action == InternalAccountEdit.profile) ...[
                    TextFormField(
                      controller: _name,
                      enabled: !_saving,
                      maxLength: 100,
                      decoration: InputDecoration(
                        labelText: l10n.adminAccountsDisplayName,
                      ),
                      validator: (value) => value?.trim().isNotEmpty ?? false
                          ? null
                          : l10n.adminAccountsDisplayName,
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: _username,
                      enabled: !_saving,
                      maxLength: 64,
                      autocorrect: false,
                      decoration: InputDecoration(
                        labelText: l10n.adminAccountsUsername,
                      ),
                    ),
                  ] else ...[
                    TextFormField(
                      controller: _confirmation,
                      enabled: !_saving,
                      keyboardType: TextInputType.emailAddress,
                      autocorrect: false,
                      decoration: InputDecoration(
                        labelText: l10n.adminAccountsConfirmEmail,
                      ),
                      validator: (value) =>
                          value?.trim().toLowerCase() ==
                              widget.account.email.toLowerCase()
                          ? null
                          : l10n.adminAccountsConfirmEmail,
                    ),
                    if (widget.action == InternalAccountEdit.password) ...[
                      const SizedBox(height: 12),
                      TextFormField(
                        controller: _password,
                        enabled: !_saving,
                        obscureText: true,
                        autocorrect: false,
                        enableSuggestions: false,
                        decoration: InputDecoration(
                          labelText: l10n.adminAccountsNewPassword,
                        ),
                        validator: (value) =>
                            value != null &&
                                value.length >= 12 &&
                                value.length <= 72
                            ? null
                            : l10n.adminAccountsNewPassword,
                      ),
                    ],
                  ],
                  if (_failed)
                    Padding(
                      padding: const EdgeInsets.only(top: 16),
                      child: Text(
                        l10n.adminAccountsFailed,
                        style: TextStyle(
                          color: Theme.of(context).colorScheme.error,
                        ),
                      ),
                    ),
                  const SizedBox(height: 24),
                  FilledButton(
                    onPressed: _saving ? null : _save,
                    child: Text(l10n.adminAccountsSave),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
