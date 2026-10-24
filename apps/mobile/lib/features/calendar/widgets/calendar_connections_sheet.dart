import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/config/env.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/calendar_account.dart';
import 'package:mobile/data/models/calendar_connection.dart';
import 'package:mobile/data/repositories/calendar_connections_repository.dart';
import 'package:mobile/features/calendar/cubit/calendar_connections_cubit.dart';
import 'package:mobile/features/calendar/cubit/calendar_connections_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';
import 'package:mobile/widgets/pending_sync_frame.dart';

/// Shows the calendar connections management bottom sheet.
///
/// Matches the web's "Manage Calendar Accounts" dialog:
///  - Lists connected accounts (Google / Microsoft) with expand/collapse
///  - Toggles individual calendar visibility
///  - Add Account buttons (Google, Outlook)
///  - Disconnect account option
Future<void> showCalendarConnectionsSheet(
  BuildContext context, {
  required String wsId,
  CalendarConnectionsRepository? repository,
}) async {
  await showAppSheet<void>(
    context: context,
    size: AppSheetSize.medium,
    builder: (_) => BlocProvider(
      create: (_) {
        final cubit = CalendarConnectionsCubit(repository: repository);
        unawaited(cubit.load(wsId));
        return cubit;
      },
      child: _ConnectionsSheetBody(wsId: wsId),
    ),
  );
}

class _AccountTile extends StatelessWidget {
  const _AccountTile({
    required this.wsId,
    required this.account,
    required this.connections,
    required this.togglingIds,
    required this.isExpanded,
    required this.isDisconnecting,
    required this.onToggleExpand,
    required this.onToggleConnection,
    required this.onDisconnect,
  });

  final String wsId;
  final CalendarAccount account;
  final List<CalendarConnection> connections;
  final Set<String> togglingIds;
  final bool isExpanded;
  final bool isDisconnecting;
  final VoidCallback onToggleExpand;
  final void Function(CalendarConnection conn, {required bool enabled})
  onToggleConnection;
  final VoidCallback onDisconnect;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final textTheme = Theme.of(context).textTheme;
    final providerColor = AppTokens.of(context).colorScheme.primary;

    return PendingSyncFrame(
      workspaceId: wsId,
      entityId: account.id,
      feature: 'calendar',
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: AppCard(
          padding: EdgeInsets.zero,
          child: Column(
            children: [
              // Account header.
              AppListTile(
                leading: CircleAvatar(
                  backgroundColor: providerColor.withValues(alpha: 0.15),
                  child: Icon(
                    account.provider == 'google'
                        ? LucideIcons.calendar
                        : LucideIcons.calendarRange,
                    color: providerColor,
                  ),
                ),
                title: Text(
                  account.displayName,
                  style: textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
                ),
                subtitle: account.accountEmail != null
                    ? Text(
                        account.accountEmail!,
                        style: textTheme.bodySmall?.copyWith(
                          color: colorScheme.onSurfaceVariant,
                        ),
                      )
                    : null,
                trailing: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    // Provider badge.
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 3,
                      ),
                      decoration: BoxDecoration(
                        color: providerColor.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Text(
                        account.provider == 'google' ? 'Google' : 'Microsoft',
                        style: textTheme.labelSmall?.copyWith(
                          color: providerColor,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                    Icon(
                      isExpanded
                          ? LucideIcons.chevronUp
                          : LucideIcons.chevronDown,
                      color: colorScheme.onSurfaceVariant,
                    ),
                  ],
                ),
                onTap: onToggleExpand,
              ),
              // Expanded calendar list.
              if (isExpanded) ...[
                const Divider(height: 1, indent: 16, endIndent: 16),
                for (final conn in connections)
                  PendingSyncFrame(
                    workspaceId: conn.wsId,
                    entityId: conn.id,
                    feature: 'calendar',
                    child: _ConnectionToggle(
                      connection: conn,
                      isToggling: togglingIds.contains(conn.id),
                      onChanged: (enabled) =>
                          onToggleConnection(conn, enabled: enabled),
                    ),
                  ),
                // Disconnect option.
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
                  child: isDisconnecting
                      ? const Center(
                          child: Padding(
                            padding: EdgeInsets.all(8),
                            child: SizedBox(
                              width: 20,
                              height: 20,
                              child: NovaLoadingIndicator(size: 20),
                            ),
                          ),
                        )
                      : AppButton.ghost(
                          onPressed: onDisconnect,
                          leading: Icon(
                            LucideIcons.unlink,
                            size: 18,
                            color: colorScheme.error,
                          ),
                          child: Text(
                            context.l10n.calendarConnectionsDisconnect,
                            style: TextStyle(color: colorScheme.error),
                          ),
                        ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _AddAccountButton extends StatelessWidget {
  const _AddAccountButton({
    required this.label,
    required this.icon,
    required this.color,
    required this.onTap,
  });

  final String label;
  final IconData icon;
  final Color color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return AppButton.outline(
      onPressed: onTap,
      leading: Icon(icon, color: color),
      child: Text(label),
    );
  }
}

class _ConnectionsSheetBody extends StatelessWidget {
  const _ConnectionsSheetBody({required this.wsId});
  final String wsId;
  @override
  Widget build(BuildContext context) => AppSheetScaffold(
    title: context.l10n.calendarConnectionsTitle,
    child: BlocBuilder<CalendarConnectionsCubit, CalendarConnectionsState>(
      builder: (context, state) {
        if (state.status == CalendarConnectionsStatus.loading) {
          return const SizedBox(
            height: 120,
            child: Center(child: NovaLoadingIndicator()),
          );
        }
        if (state.status == CalendarConnectionsStatus.error) {
          return _ErrorBody(
            error: state.error,
            onRetry: () => context.read<CalendarConnectionsCubit>().load(wsId),
          );
        }
        return _LoadedBody(wsId: wsId, state: state);
      },
    ),
  );
}

class _ConnectionToggle extends StatelessWidget {
  const _ConnectionToggle({
    required this.connection,
    required this.isToggling,
    required this.onChanged,
  });

  final CalendarConnection connection;
  final bool isToggling;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final calColor = connection.color != null
        ? _parseHexColor(connection.color!, colorScheme.primary)
        : colorScheme.primary;

    return AppListTile(
      leading: Container(
        width: 12,
        height: 12,
        decoration: BoxDecoration(shape: BoxShape.circle, color: calColor),
      ),
      title: Text(
        connection.calendarName,
        style: Theme.of(context).textTheme.bodyMedium,
      ),
      trailing: isToggling
          ? const SizedBox(
              width: 20,
              height: 20,
              child: NovaLoadingIndicator(size: 20),
            )
          : AppSwitch(value: connection.isEnabled, onChanged: onChanged),
    );
  }

  static Color _parseHexColor(String hex, Color fallback) {
    final cleaned = hex.replaceFirst('#', '').trim();
    if (cleaned.length == 8) {
      final value = int.tryParse(cleaned, radix: 16);
      if (value != null) {
        return Color(value);
      }
    }
    if (cleaned.length == 6) {
      final value = int.tryParse('FF$cleaned', radix: 16);
      if (value != null) {
        return Color(value);
      }
    }
    return fallback;
  }
}

class _ErrorBody extends StatelessWidget {
  const _ErrorBody({required this.onRetry, this.error});

  final String? error;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            LucideIcons.circleAlert,
            size: 48,
            color: Theme.of(context).colorScheme.error,
          ),
          const SizedBox(height: 12),
          Text(error ?? l10n.commonSomethingWentWrong),
          const SizedBox(height: 12),
          AppButton.secondary(
            onPressed: onRetry,
            child: Text(context.l10n.commonRetry),
          ),
        ],
      ),
    );
  }
}

class _LoadedBody extends StatefulWidget {
  const _LoadedBody({required this.wsId, required this.state});

  final String wsId;
  final CalendarConnectionsState state;

  @override
  State<_LoadedBody> createState() => _LoadedBodyState();
}

class _LoadedBodyState extends State<_LoadedBody> {
  final _expandedAccounts = <String>{};

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final state = widget.state;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // Connected accounts.
        if (state.accounts.isNotEmpty) ...[
          _SectionHeader(label: l10n.calendarConnectionsAccounts),
          for (final account in state.accounts)
            _AccountTile(
              wsId: widget.wsId,
              account: account,
              connections: state.connectionsByAccount[account.id] ?? [],
              togglingIds: state.togglingIds,
              isExpanded: _expandedAccounts.contains(account.id),
              isDisconnecting: state.disconnectingId == account.id,
              onToggleExpand: () => setState(() {
                if (_expandedAccounts.contains(account.id)) {
                  _expandedAccounts.remove(account.id);
                } else {
                  _expandedAccounts.add(account.id);
                }
              }),
              onToggleConnection: (conn, {required enabled}) {
                unawaited(
                  context.read<CalendarConnectionsCubit>().toggleConnection(
                    conn.id,
                    enabled: enabled,
                  ),
                );
              },
              onDisconnect: () => _confirmDisconnect(context, account),
            ),
          const SizedBox(height: 16),
        ],

        // Add account section.
        if (Env.isCalendarIntegrationsEnabled) ...[
          _SectionHeader(label: l10n.calendarConnectionsAddAccount),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: _AddAccountButton(
                  label: 'Google',
                  icon: LucideIcons.calendar,
                  color: AppTokens.of(context).colorScheme.primary,
                  onTap: () => unawaited(
                    context.read<CalendarConnectionsCubit>().connectGoogle(
                      widget.wsId,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _AddAccountButton(
                  label: 'Outlook',
                  icon: LucideIcons.calendarRange,
                  color: AppTokens.of(context).colorScheme.primary,
                  onTap: () => unawaited(
                    context.read<CalendarConnectionsCubit>().connectMicrosoft(
                      widget.wsId,
                    ),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
        ],

        // Empty state.
        if (state.accounts.isEmpty) ...[
          const SizedBox(height: 32),
          Center(
            child: Column(
              children: [
                Icon(
                  LucideIcons.unlink,
                  size: 48,
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
                const SizedBox(height: 12),
                Text(
                  l10n.calendarConnectionsEmpty,
                  style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
                ),
              ],
            ),
          ),
        ],

        const SizedBox(height: 24),
      ],
    );
  }

  @override
  void didUpdateWidget(covariant _LoadedBody oldWidget) {
    super.didUpdateWidget(oldWidget);
    final previousIds = oldWidget.state.accounts
        .map((account) => account.id)
        .toSet();
    final newIds = widget.state.accounts.map((account) => account.id).toSet();
    final addedIds = newIds.difference(previousIds);
    if (addedIds.isNotEmpty) {
      setState(() {
        _expandedAccounts.addAll(addedIds);
      });
    }
  }

  @override
  void initState() {
    super.initState();
    // Expand all accounts initially.
    for (final a in widget.state.accounts) {
      _expandedAccounts.add(a.id);
    }
  }

  void _confirmDisconnect(BuildContext context, CalendarAccount account) {
    final l10n = context.l10n;
    unawaited(
      showAppDialog<void>(
        context: context,
        builder: (dialogContext) => Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 400),
            child: AppDialog(
              title: l10n.calendarConnectionsDisconnect,
              content: Text(
                l10n.calendarConnectionsDisconnectConfirm(
                  account.accountEmail ?? account.provider,
                ),
              ),
              actions: [
                AppButton.outline(
                  onPressed: () => Navigator.pop(dialogContext),
                  child: Text(l10n.calendarEventCancel),
                ),
                AppButton.destructive(
                  onPressed: () {
                    Navigator.pop(dialogContext);
                    unawaited(
                      context
                          .read<CalendarConnectionsCubit>()
                          .disconnectAccount(account.id, widget.wsId),
                    );
                  },
                  child: Text(l10n.calendarConnectionsDisconnect),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// ── Subwidgets ───────────────────────────────────────────────────────

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 8, bottom: 4),
      child: Text(
        label.toUpperCase(),
        style: Theme.of(context).textTheme.labelSmall?.copyWith(
          color: Theme.of(context).colorScheme.onSurfaceVariant,
          letterSpacing: 1.2,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}
