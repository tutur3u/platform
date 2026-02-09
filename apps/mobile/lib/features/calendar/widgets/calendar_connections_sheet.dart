import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/data/models/calendar_account.dart';
import 'package:mobile/data/models/calendar_connection.dart';
import 'package:mobile/features/calendar/cubit/calendar_connections_cubit.dart';
import 'package:mobile/features/calendar/cubit/calendar_connections_state.dart';
import 'package:mobile/l10n/l10n.dart';

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
}) async {
  await showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
    ),
    builder: (_) => BlocProvider(
      create: (_) {
        final cubit = CalendarConnectionsCubit();
        unawaited(cubit.load(wsId));
        return cubit;
      },
      child: _ConnectionsSheetBody(wsId: wsId),
    ),
  );
}

class _ConnectionsSheetBody extends StatelessWidget {
  const _ConnectionsSheetBody({required this.wsId});

  final String wsId;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final colorScheme = Theme.of(context).colorScheme;

    return DraggableScrollableSheet(
      initialChildSize: 0.7,
      minChildSize: 0.4,
      maxChildSize: 0.95,
      expand: false,
      builder: (context, scrollController) {
        return Column(
          children: [
            // Drag handle.
            Padding(
              padding: const EdgeInsets.only(top: 8, bottom: 4),
              child: Container(
                width: 36,
                height: 4,
                decoration: BoxDecoration(
                  color: colorScheme.onSurfaceVariant.withValues(alpha: 0.4),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            // Header.
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 4),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    l10n.calendarConnectionsTitle,
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const SizedBox(height: 4),
                  Text(
                    l10n.calendarConnectionsSubtitle,
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: colorScheme.onSurfaceVariant,
                    ),
                  ),
                ],
              ),
            ),
            const Divider(),
            // Body.
            Expanded(
              child:
                  BlocBuilder<
                    CalendarConnectionsCubit,
                    CalendarConnectionsState
                  >(
                    builder: (context, state) {
                      if (state.status == CalendarConnectionsStatus.loading) {
                        return const Center(child: CircularProgressIndicator());
                      }
                      if (state.status == CalendarConnectionsStatus.error) {
                        return _ErrorBody(
                          error: state.error,
                          onRetry: () => context
                              .read<CalendarConnectionsCubit>()
                              .load(wsId),
                        );
                      }
                      return _LoadedBody(
                        wsId: wsId,
                        state: state,
                        scrollController: scrollController,
                      );
                    },
                  ),
            ),
          ],
        );
      },
    );
  }
}

class _LoadedBody extends StatefulWidget {
  const _LoadedBody({
    required this.wsId,
    required this.state,
    required this.scrollController,
  });

  final String wsId;
  final CalendarConnectionsState state;
  final ScrollController scrollController;

  @override
  State<_LoadedBody> createState() => _LoadedBodyState();
}

class _LoadedBodyState extends State<_LoadedBody> {
  final _expandedAccounts = <String>{};

  @override
  void initState() {
    super.initState();
    // Expand all accounts initially.
    for (final a in widget.state.accounts) {
      _expandedAccounts.add(a.id);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final state = widget.state;

    return ListView(
      controller: widget.scrollController,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      children: [
        // Connected accounts.
        if (state.accounts.isNotEmpty) ...[
          _SectionHeader(label: l10n.calendarConnectionsAccounts),
          for (final account in state.accounts)
            _AccountTile(
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
        _SectionHeader(label: l10n.calendarConnectionsAddAccount),
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(
              child: _AddAccountButton(
                label: 'Google',
                icon: Icons.g_mobiledata,
                color: const Color(0xFF4285F4),
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
                icon: Icons.window,
                color: const Color(0xFF0078D4),
                onTap: () => unawaited(
                  context.read<CalendarConnectionsCubit>().connectMicrosoft(
                    widget.wsId,
                  ),
                ),
              ),
            ),
          ],
        ),

        // Empty state.
        if (state.accounts.isEmpty) ...[
          const SizedBox(height: 32),
          Center(
            child: Column(
              children: [
                Icon(
                  Icons.link_off,
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

  void _confirmDisconnect(BuildContext context, CalendarAccount account) {
    final l10n = context.l10n;
    unawaited(
      showDialog<void>(
        context: context,
        builder: (dialogContext) => AlertDialog(
          title: Text(l10n.calendarConnectionsDisconnect),
          content: Text(
            l10n.calendarConnectionsDisconnectConfirm(
              account.accountEmail ?? account.provider,
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext),
              child: Text(l10n.calendarEventCancel),
            ),
            FilledButton(
              style: FilledButton.styleFrom(
                backgroundColor: Theme.of(context).colorScheme.error,
              ),
              onPressed: () {
                Navigator.pop(dialogContext);
                unawaited(
                  context.read<CalendarConnectionsCubit>().disconnectAccount(
                    account.id,
                    widget.wsId,
                  ),
                );
              },
              child: Text(l10n.calendarConnectionsDisconnect),
            ),
          ],
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

class _AccountTile extends StatelessWidget {
  const _AccountTile({
    required this.account,
    required this.connections,
    required this.togglingIds,
    required this.isExpanded,
    required this.isDisconnecting,
    required this.onToggleExpand,
    required this.onToggleConnection,
    required this.onDisconnect,
  });

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
    final providerColor = account.provider == 'google'
        ? const Color(0xFF4285F4)
        : const Color(0xFF0078D4);

    return Card(
      margin: const EdgeInsets.symmetric(vertical: 4),
      child: Column(
        children: [
          // Account header.
          ListTile(
            leading: CircleAvatar(
              backgroundColor: providerColor.withValues(alpha: 0.15),
              child: Icon(
                account.provider == 'google'
                    ? Icons.g_mobiledata
                    : Icons.window,
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
                      ? Icons.keyboard_arrow_up
                      : Icons.keyboard_arrow_down,
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
              _ConnectionToggle(
                connection: conn,
                isToggling: togglingIds.contains(conn.id),
                onChanged: (enabled) =>
                    onToggleConnection(conn, enabled: enabled),
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
                          child: CircularProgressIndicator(strokeWidth: 2),
                        ),
                      ),
                    )
                  : TextButton.icon(
                      onPressed: onDisconnect,
                      icon: Icon(
                        Icons.link_off,
                        size: 18,
                        color: colorScheme.error,
                      ),
                      label: Text(
                        context.l10n.calendarConnectionsDisconnect,
                        style: TextStyle(color: colorScheme.error),
                      ),
                    ),
            ),
          ],
        ],
      ),
    );
  }
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
        ? _parseHexColor(connection.color!)
        : colorScheme.primary;

    return ListTile(
      dense: true,
      leading: Container(
        width: 12,
        height: 12,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: calColor,
        ),
      ),
      title: Text(
        connection.calendarName,
        style: Theme.of(context).textTheme.bodyMedium,
      ),
      trailing: isToggling
          ? const SizedBox(
              width: 20,
              height: 20,
              child: CircularProgressIndicator(strokeWidth: 2),
            )
          : Switch.adaptive(
              value: connection.isEnabled,
              onChanged: onChanged,
            ),
    );
  }

  Color _parseHexColor(String hex) {
    final cleaned = hex.replaceFirst('#', '');
    if (cleaned.length == 6) {
      return Color(int.parse('FF$cleaned', radix: 16));
    }
    return Colors.blue;
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
    return OutlinedButton.icon(
      onPressed: onTap,
      icon: Icon(icon, color: color),
      label: Text(label),
      style: OutlinedButton.styleFrom(
        padding: const EdgeInsets.symmetric(vertical: 12),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      ),
    );
  }
}

class _ErrorBody extends StatelessWidget {
  const _ErrorBody({required this.onRetry, this.error});

  final String? error;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            Icons.error_outline,
            size: 48,
            color: Theme.of(context).colorScheme.error,
          ),
          const SizedBox(height: 12),
          Text(error ?? 'Something went wrong'),
          const SizedBox(height: 12),
          FilledButton.tonal(
            onPressed: onRetry,
            child: Text(context.l10n.commonRetry),
          ),
        ],
      ),
    );
  }
}
