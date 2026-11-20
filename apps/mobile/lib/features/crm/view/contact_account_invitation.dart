import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/crm/crm_models.dart';
import 'package:mobile/l10n/l10n.dart';

class ContactAccountInvitation extends StatefulWidget {
  const ContactAccountInvitation({
    required this.loadAccounts,
    required this.createInvitation,
    required this.shareInvitation,
    required this.revokeInvitation,
    super.key,
  });

  final Future<List<CrmLinkedUser>> Function() loadAccounts;
  final Future<Uri> Function(String accountId) createInvitation;
  final Future<void> Function() revokeInvitation;
  final Future<void> Function(Uri uri, Rect? sharePosition) shareInvitation;

  @override
  State<ContactAccountInvitation> createState() =>
      _ContactAccountInvitationState();
}

class _ContactAccountInvitationState extends State<ContactAccountInvitation> {
  late Future<List<CrmLinkedUser>> _accounts = widget.loadAccounts();
  String _query = '';
  CrmLinkedUser? _selected;
  Uri? _invitation;
  bool _busy = false;
  bool _failed = false;

  Future<void> _create(CrmLinkedUser account) async {
    if (_busy || _invitation != null) return;
    setState(() {
      _busy = true;
      _failed = false;
    });
    try {
      final invitation = await widget.createInvitation(account.id);
      if (mounted) setState(() => _invitation = invitation);
    } on Object {
      if (mounted) setState(() => _failed = true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _share(Uri invitation) async {
    final box = context.findRenderObject();
    try {
      await widget.shareInvitation(
        invitation,
        box is RenderBox ? box.localToGlobal(Offset.zero) & box.size : null,
      );
    } on Object {
      if (mounted) setState(() => _failed = true);
    }
  }

  Future<void> _revoke() async {
    if (_busy) return;
    final l10n = context.l10n;
    final confirmed = await showAppConfirmDialog(
      context: context,
      title: l10n.crmContactAccountRevoke,
      message: l10n.crmContactAccountRevokeConfirm,
      confirmLabel: l10n.crmContactAccountRevoke,
      cancelLabel: l10n.commonCancel,
      destructive: true,
    );
    if (!confirmed || !mounted) return;
    setState(() {
      _busy = true;
      _failed = false;
    });
    try {
      await widget.revokeInvitation();
      if (!mounted) return;
      Navigator.of(context).pop();
    } on Object {
      if (mounted) setState(() => _failed = true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final invitation = _invitation;
    final selected = _selected;
    return AppSheetScaffold(
      title: l10n.crmContactAccountInvitation,
      icon: LucideIcons.link,
      actions: [
        AppButton.outline(
          onPressed: _busy ? null : _revoke,
          child: Text(l10n.crmContactAccountRevoke),
        ),
      ],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (invitation != null) ...[
            Text(l10n.crmContactAccountShareInstructions),
            const SizedBox(height: AppSpacing.md),
            AppButton.primary(
              onPressed: () => _share(invitation),
              child: Text(l10n.crmContactAccountShare),
            ),
          ] else ...[
            Text(l10n.crmContactAccountInvitationInstructions),
            if (selected != null) ...[
              AppRichRow(title: selected.label, subtitle: selected.id),
              AppButton.primary(
                onPressed: _busy ? null : () => _create(selected),
                loading: _busy,
                child: Text(l10n.crmContactAccountCreate),
              ),
              AppButton.ghost(
                onPressed: _busy
                    ? null
                    : () => setState(() => _selected = null),
                child: Text(l10n.commonCancel),
              ),
            ] else ...[
              const SizedBox(height: AppSpacing.md),
              AppTextField(
                label: l10n.crmContactAccountSearch,
                placeholder: l10n.crmContactAccountSearch,
                onChanged: (query) =>
                    setState(() => _query = query.trim().toLowerCase()),
              ),
              FutureBuilder<List<CrmLinkedUser>>(
                future: _accounts,
                builder: (context, snapshot) {
                  if (snapshot.connectionState != ConnectionState.done) {
                    return const AppSkeletonRows(count: 3);
                  }
                  if (snapshot.hasError) {
                    return AppButton.outline(
                      onPressed: () =>
                          setState(() => _accounts = widget.loadAccounts()),
                      child: Text(l10n.commonRetry),
                    );
                  }
                  final matches = (snapshot.data ?? const <CrmLinkedUser>[])
                      .where(
                        (account) =>
                            account.label.toLowerCase().contains(_query) ||
                            account.id.toLowerCase().contains(_query),
                      )
                      .take(40)
                      .toList();
                  return Column(
                    children: [
                      if (matches.isEmpty) Text(l10n.crmContactAccountNone),
                      for (final account in matches)
                        AppRichRow(
                          title: account.label,
                          subtitle: account.id,
                          onTap: () => setState(() => _selected = account),
                        ),
                    ],
                  );
                },
              ),
            ],
          ],
          if (_failed) Text(l10n.crmContactAccountUnavailable),
        ],
      ),
    );
  }
}
