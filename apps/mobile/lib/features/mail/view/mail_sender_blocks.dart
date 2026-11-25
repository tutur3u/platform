import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/mail/data/mail_repository.dart';
import 'package:mobile/features/settings/view/settings_scoped_page.dart';
import 'package:mobile/l10n/l10n.dart';

Future<void> showMailSenderBlocks(
  BuildContext context, {
  required MailRepository repository,
  required String workspaceId,
  required String mailboxId,
  required bool Function() isScopeCurrent,
}) => pushScopedSettingsPage(
  context,
  asSheet: true,
  builder: (context, isCurrent) => _MailSenderBlocks(
    repository: repository,
    workspaceId: workspaceId,
    mailboxId: mailboxId,
    isScopeCurrent: () => isCurrent() && isScopeCurrent(),
  ),
);

class _MailSenderBlocks extends StatefulWidget {
  const _MailSenderBlocks({
    required this.repository,
    required this.workspaceId,
    required this.mailboxId,
    required this.isScopeCurrent,
  });

  final MailRepository repository;
  final String workspaceId;
  final String mailboxId;
  final bool Function() isScopeCurrent;

  @override
  State<_MailSenderBlocks> createState() => _MailSenderBlocksState();
}

class _MailSenderBlocksState extends State<_MailSenderBlocks> {
  final _input = TextEditingController();
  late Future<List<Map<String, dynamic>>> _blocks;
  bool _moveExisting = true;
  bool _editing = false;

  @override
  void initState() {
    super.initState();
    _blocks = _readBlocks();
  }

  @override
  void dispose() {
    _input.dispose();
    super.dispose();
  }

  Future<List<Map<String, dynamic>>> _readBlocks() =>
      widget.repository.senderBlocks(widget.workspaceId, widget.mailboxId);

  Future<void> _refresh() async {
    if (!widget.isScopeCurrent()) return;
    final reload = _readBlocks();
    setState(() => _blocks = reload);
    try {
      await reload;
    } on Object {
      // The list exposes the retry for this request.
    }
  }

  void _checkScope() {
    if (!widget.isScopeCurrent()) {
      throw const ApiException(
        message: 'Mail settings scope changed',
        statusCode: 0,
      );
    }
  }

  Future<void> _add() async {
    if (_editing || !widget.isScopeCurrent()) return;
    final raw = _input.text.trim().toLowerCase();
    if (raw.isEmpty) return;
    final domain = raw.indexOf('@') <= 0;
    final value = raw.startsWith('@') ? raw.substring(1) : raw;
    final l10n = context.l10n;
    final moveExisting = _moveExisting;
    setState(() => _editing = true);
    try {
      final saved = await showAppAsyncConfirmDialog(
        context: context,
        title: l10n.mailBlockSender,
        message: moveExisting ? l10n.mailBlockMoveExisting : null,
        confirmLabel: l10n.mailBlockSender,
        cancelLabel: l10n.commonCancel,
        describeError: (error) =>
            error is ApiException && error.statusCode == 400
            ? l10n.mailBlockInvalid
            : l10n.commonSomethingWentWrong,
        onConfirm: () async {
          _checkScope();
          await widget.repository.addSenderBlock(
            widget.workspaceId,
            widget.mailboxId,
            kind: domain ? 'domain' : 'address',
            value: value,
            moveExisting: moveExisting,
          );
        },
      );
      if (saved && mounted && widget.isScopeCurrent()) {
        _input.clear();
        await _refresh();
      }
    } finally {
      if (mounted) setState(() => _editing = false);
    }
  }

  Future<void> _remove(String id) async {
    if (_editing || !widget.isScopeCurrent()) return;
    final l10n = context.l10n;
    final restore = await showAppActionSheet<bool>(
      context: context,
      title: l10n.mailUnblockSender,
      actions: [
        AppSheetAction(label: l10n.mailUnblockSender, value: false),
        AppSheetAction(label: l10n.mailUnblockRestore, value: true),
      ],
    );
    if (!mounted || restore == null || !widget.isScopeCurrent()) return;
    setState(() => _editing = true);
    try {
      final saved = await showAppAsyncConfirmDialog(
        context: context,
        title: l10n.mailUnblockSender,
        message: restore ? l10n.mailUnblockRestore : null,
        confirmLabel: l10n.mailUnblockSender,
        cancelLabel: l10n.commonCancel,
        describeError: (_) => l10n.commonSomethingWentWrong,
        onConfirm: () async {
          _checkScope();
          await widget.repository.removeSenderBlock(
            widget.workspaceId,
            widget.mailboxId,
            id,
            restoreToInbox: restore,
          );
        },
      );
      if (saved && mounted) await _refresh();
    } finally {
      if (mounted) setState(() => _editing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return AppSheetScaffold(
      title: l10n.mailBlockedSenders,
      onRefresh: _refresh,
      slivers: [
        SliverToBoxAdapter(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              AppTextField(
                controller: _input,
                enabled: !_editing,
                label: l10n.mailBlockSender,
                placeholder: l10n.mailBlockSenderPlaceholder,
                keyboardType: TextInputType.emailAddress,
              ),
              SwitchListTile(
                title: Text(l10n.mailBlockMoveExisting),
                value: _moveExisting,
                onChanged: _editing
                    ? null
                    : (value) => setState(() => _moveExisting = value),
              ),
              ValueListenableBuilder(
                valueListenable: _input,
                builder: (context, value, _) => AppButton.primary(
                  onPressed: _editing || value.text.trim().isEmpty
                      ? null
                      : _add,
                  child: Text(l10n.mailBlockSender),
                ),
              ),
            ],
          ),
        ),
        FutureBuilder(
          future: _blocks,
          builder: (context, snapshot) {
            if (snapshot.connectionState != ConnectionState.done) {
              return const SliverToBoxAdapter(child: AppLoadingIndicator());
            }
            if (snapshot.hasError) {
              return SliverToBoxAdapter(
                child: AppButton.outline(
                  onPressed: _refresh,
                  child: Text(l10n.commonRetry),
                ),
              );
            }
            final items = snapshot.data ?? const [];
            if (items.isEmpty) {
              return SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: AppSpacing.md),
                  child: Text(l10n.mailNoBlockedSenders),
                ),
              );
            }
            return SliverList.builder(
              itemCount: items.length,
              itemBuilder: (context, index) {
                final item = items[index];
                final domain = item['kind'] == 'domain' ? '@' : '';
                return ListTile(
                  key: ValueKey(item['id']),
                  title: Text('$domain${item['value']}'),
                  trailing: AppIconButton(
                    icon: const Icon(Icons.delete_outline),
                    tooltip: l10n.mailUnblockSender,
                    onPressed: _editing
                        ? null
                        : () => _remove(item['id'] as String),
                  ),
                );
              },
            );
          },
        ),
      ],
    );
  }
}
