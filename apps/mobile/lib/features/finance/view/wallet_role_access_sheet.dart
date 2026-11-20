import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/workspace_management.dart';
import 'package:mobile/data/repositories/finance_wallet_roles_repository.dart';
import 'package:mobile/data/sources/api_exception.dart';
import 'package:mobile/l10n/l10n.dart';

String walletRoleWindowLabel(
  BuildContext context,
  WalletRoleWindow window, [
  int? customDays,
]) {
  final l10n = context.l10n;
  return switch (window) {
    WalletRoleWindow.oneDay => l10n.financeWalletRoleWindow1Day,
    WalletRoleWindow.threeDays => l10n.financeWalletRoleWindow3Days,
    WalletRoleWindow.sevenDays => l10n.financeWalletRoleWindow7Days,
    WalletRoleWindow.twoWeeks => l10n.financeWalletRoleWindow2Weeks,
    WalletRoleWindow.oneMonth => l10n.financeWalletRoleWindow1Month,
    WalletRoleWindow.oneQuarter => l10n.financeWalletRoleWindow1Quarter,
    WalletRoleWindow.oneYear => l10n.financeWalletRoleWindow1Year,
    WalletRoleWindow.custom =>
      customDays == null
          ? l10n.financeWalletRoleWindowCustom
          : l10n.financeWalletRoleWindowDays(customDays),
  };
}

/// Lists the roles that see [walletId] with their history window, and lets
/// role managers grant, change and revoke access.
Future<void> showWalletRoleAccess(
  BuildContext context, {
  required String workspaceId,
  required String walletId,
  FinanceWalletRolesRepository? repository,
}) => showAppSheet<void>(
  context: context,
  size: AppSheetSize.large,
  builder: (_) => WalletRoleAccessSheet(
    workspaceId: workspaceId,
    walletId: walletId,
    repository: repository ?? FinanceWalletRolesRepository(),
  ),
);

class WalletRoleAccessSheet extends StatefulWidget {
  const WalletRoleAccessSheet({
    required this.workspaceId,
    required this.walletId,
    required this.repository,
    super.key,
  });

  final String workspaceId;
  final String walletId;
  final FinanceWalletRolesRepository repository;

  @override
  State<WalletRoleAccessSheet> createState() => _WalletRoleAccessSheetState();
}

class _WalletRoleAccessSheetState extends State<WalletRoleAccessSheet> {
  List<WalletRoleAccess>? _access;
  bool _failed = false;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  Future<void> _load({bool force = false}) async {
    try {
      final access = await widget.repository.list(
        widget.workspaceId,
        widget.walletId,
        forceRefresh: force,
      );
      if (mounted) {
        setState(() {
          _access = access;
          _failed = false;
        });
      }
    } on Object {
      if (mounted) setState(() => _failed = true);
    }
  }

  /// Asks for a window, then custom days when needed. Null when dismissed.
  Future<(WalletRoleWindow, int?)?> _pickWindow([
    WalletRoleAccess? current,
  ]) async {
    final window = await showAppChoiceSheet<WalletRoleWindow>(
      context: context,
      title: context.l10n.financeWalletRoleWindow,
      selected: current?.window ?? WalletRoleWindow.oneMonth,
      choices: [
        for (final window in WalletRoleWindow.values)
          AppSheetChoice(
            value: window,
            label: walletRoleWindowLabel(context, window),
          ),
      ],
    );
    if (window == null || !mounted) return null;
    if (window != WalletRoleWindow.custom) return (window, null);
    final days = await showAppSheet<int>(
      context: context,
      size: AppSheetSize.medium,
      builder: (_) => _CustomDaysSheet(initial: current?.customDays),
    );
    return days == null ? null : (window, days);
  }

  Future<void> _write(Future<void> Function() action, String done) async {
    final l10n = context.l10n;
    setState(() => _busy = true);
    try {
      await action();
      if (!mounted) return;
      showAppToast(context, message: done);
      await _load(force: true);
    } on ApiException catch (error) {
      if (mounted) {
        showAppToast(
          context,
          message: error.statusCode == 409
              ? error.message
              : l10n.commonSomethingWentWrong,
        );
      }
    } on Object {
      if (mounted) {
        showAppToast(context, message: l10n.commonSomethingWentWrong);
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _grant() async {
    final l10n = context.l10n;
    final granted = {
      for (final access in _access ?? const <WalletRoleAccess>[]) access.roleId,
    };
    List<WorkspaceRoleListItem> roles;
    try {
      roles = await widget.repository.workspaceRoles(widget.workspaceId);
    } on Object {
      if (mounted) {
        showAppToast(context, message: l10n.commonSomethingWentWrong);
      }
      return;
    }
    if (!mounted) return;
    final available = [
      for (final role in roles)
        if (!granted.contains(role.id)) role,
    ];
    if (available.isEmpty) {
      showAppToast(context, message: l10n.financeWalletRoleAllGranted);
      return;
    }
    final roleId = await showAppChoiceSheet<String>(
      context: context,
      title: l10n.financeWalletRoleGrant,
      selected: null,
      choices: [
        for (final role in available)
          AppSheetChoice(
            value: role.id,
            label: role.name,
            icon: LucideIcons.shieldCheck,
          ),
      ],
    );
    if (roleId == null || !mounted) return;
    final picked = await _pickWindow();
    if (picked == null || !mounted) return;
    await _write(
      () => widget.repository.grant(
        widget.workspaceId,
        widget.walletId,
        roleId: roleId,
        window: picked.$1,
        customDays: picked.$2,
      ),
      l10n.financeWalletRoleSaved,
    );
  }

  Future<void> _change(WalletRoleAccess access) async {
    final l10n = context.l10n;
    final picked = await _pickWindow(access);
    if (picked == null || !mounted) return;
    await _write(
      () => widget.repository.update(
        widget.workspaceId,
        widget.walletId,
        roleId: access.roleId,
        window: picked.$1,
        customDays: picked.$2,
      ),
      l10n.financeWalletRoleSaved,
    );
  }

  Future<void> _revoke(WalletRoleAccess access) async {
    final l10n = context.l10n;
    final confirmed = await showAppConfirmDialog(
      context: context,
      title: l10n.financeWalletRoleRevokeTitle(access.roleName),
      message: l10n.financeWalletRoleRevokeBody,
      confirmLabel: l10n.financeWalletRoleRevoke,
      cancelLabel: l10n.commonCancel,
      destructive: true,
    );
    if (!confirmed || !mounted) return;
    await _write(
      () => widget.repository.revoke(
        widget.workspaceId,
        widget.walletId,
        access.roleId,
      ),
      l10n.financeWalletRoleRevoked,
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final access = _access;
    return AppSheetScaffold(
      title: l10n.financeWalletRoleAccess,
      onRefresh: () => _load(force: true),
      actions: [
        AppButton.primary(
          key: const ValueKey('wallet-role-grant'),
          leading: const Icon(LucideIcons.plus),
          onPressed: _busy || access == null ? null : () => unawaited(_grant()),
          child: Text(l10n.financeWalletRoleGrant),
        ),
      ],
      child: switch (access) {
        null when _failed => AppStateMessage.inline(
          icon: LucideIcons.circleAlert,
          title: l10n.commonSomethingWentWrong,
          tone: AppTone.destructive,
          actionLabel: l10n.commonRetry,
          onAction: () => unawaited(_load(force: true)),
        ),
        null => const AppSkeletonRows(count: 3),
        [] => AppStateMessage.inline(
          icon: LucideIcons.shieldCheck,
          title: l10n.financeWalletRoleEmpty,
          message: l10n.financeWalletRoleEmptyBody,
        ),
        final rows => AppGroupedCard(
          children: [
            for (final row in rows)
              AppRichRow(
                key: ValueKey('wallet-role-${row.roleId}'),
                title: row.roleName,
                subtitle: walletRoleWindowLabel(
                  context,
                  row.window,
                  row.customDays,
                ),
                leading: const AppIconTile(
                  icon: LucideIcons.shieldCheck,
                  tone: AppTone.primary,
                ),
                trailing: AppIconButton(
                  icon: const Icon(LucideIcons.x),
                  tooltip: l10n.financeWalletRoleRevoke,
                  onPressed: _busy ? null : () => unawaited(_revoke(row)),
                ),
                onTap: _busy ? null : () => unawaited(_change(row)),
              ),
          ],
        ),
      },
    );
  }
}

class _CustomDaysSheet extends StatefulWidget {
  const _CustomDaysSheet({this.initial});

  final int? initial;

  @override
  State<_CustomDaysSheet> createState() => _CustomDaysSheetState();
}

class _CustomDaysSheetState extends State<_CustomDaysSheet> {
  late final _days = TextEditingController(text: widget.initial?.toString());
  bool _submitted = false;

  int? get _value {
    final value = int.tryParse(_days.text.trim());
    return value != null && value >= 1 && value <= 365 ? value : null;
  }

  @override
  void dispose() {
    _days.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return AppSheetScaffold(
      title: l10n.financeWalletRoleWindowCustom,
      actions: [
        AppButton.primary(
          key: const ValueKey('wallet-role-days-save'),
          onPressed: () {
            setState(() => _submitted = true);
            final value = _value;
            if (value != null) Navigator.of(context).pop(value);
          },
          child: Text(l10n.commonSave),
        ),
      ],
      child: AppTextField(
        key: const ValueKey('wallet-role-days'),
        controller: _days,
        label: l10n.financeWalletRoleCustomDays,
        placeholder: '30',
        keyboardType: TextInputType.number,
        errorText: _submitted && _value == null
            ? l10n.financeWalletRoleCustomDaysInvalid
            : null,
        onChanged: (_) => setState(() {}),
      ),
    );
  }
}
