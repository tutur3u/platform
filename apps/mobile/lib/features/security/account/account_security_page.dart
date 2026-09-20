import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/security/account/account_security_repository.dart';
import 'package:mobile/features/security/data/local_auth_service.dart';
import 'package:mobile/features/settings/view/settings_dialogs.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;
import 'package:supabase_flutter/supabase_flutter.dart';

class AccountSecurityPage extends StatefulWidget {
  const AccountSecurityPage({this.repository, super.key});
  final AccountSecurityRepository? repository;
  @override
  State<AccountSecurityPage> createState() => _AccountSecurityPageState();
}

class _AccountSecurityPageState extends State<AccountSecurityPage>
    with WidgetsBindingObserver {
  late final AccountSecurityRepository _repo =
      widget.repository ?? AccountSecurityRepository();
  List<AccountSession> _sessions = [];
  List<UserIdentity> _identities = [];
  bool _loading = true;
  bool _busy = false;
  bool _failed = false;
  int _generation = 0;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    unawaited(_load());
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && !_busy) unawaited(_load());
  }

  Future<void> _load() async {
    final generation = ++_generation;
    final userId = Supabase.instance.client.auth.currentUser?.id;
    try {
      final sessions = await _repo.sessions();
      final identities = await _repo.identities();
      if (!mounted ||
          generation != _generation ||
          Supabase.instance.client.auth.currentUser?.id != userId) {
        return;
      }
      setState(() {
        _sessions = sessions;
        _identities = identities;
        _failed = false;
      });
    } on Object {
      if (mounted) setState(() => _failed = true);
    } finally {
      if (mounted && generation == _generation) {
        setState(() => _loading = false);
      }
    }
  }

  Future<void> _change(
    Future<void> Function() action, {
    required String title,
    required String description,
  }) async {
    if (_busy) return;
    final userId = Supabase.instance.client.auth.currentUser?.id;
    final reason = context.l10n.deviceMfaVerifyReason;
    final confirmed = await showSettingsConfirmationDialog(
      context: context,
      title: title,
      description: description,
      confirmLabel: title,
      isDestructive: true,
    );
    if (!mounted || confirmed != true) return;
    setState(() {
      _busy = true;
      _failed = false;
    });
    try {
      if (!await DeviceLocalAuthService().authenticate(reason: reason)) return;
      if (Supabase.instance.client.auth.currentUser?.id != userId) return;
      await action();
      await _load();
    } on Object {
      if (mounted) setState(() => _failed = true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.securitySessionsTitle),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          onPressed: () => context.go(Routes.settingsSession),
        ),
      ),
      body: SafeArea(
        top: false,
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 1000),
            child: NovaRefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.all(20),
                children: [
                  if (_loading) const NovaLoadingIndicator(size: 20),
                  if (_failed)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 16),
                      child: Text(l10n.deviceMfaError),
                    ),
                  Text(
                    l10n.securitySessionsTitle,
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const SizedBox(height: 8),
                  Text(l10n.securitySessionsDescription),
                  const SizedBox(height: 12),
                  for (final session in _sessions)
                    Card(
                      child: ListTile(
                        leading: Icon(
                          session.label.toLowerCase().contains('mobile')
                              ? Icons.smartphone_rounded
                              : Icons.devices_rounded,
                        ),
                        title: Text(
                          session.label.isEmpty
                              ? l10n.securityUnknownDevice
                              : session.label,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                        subtitle: Text(
                          [
                            if (session.current) l10n.securityCurrentSession,
                            if (session.lastActive != null)
                              DateFormat.yMMMd().add_jm().format(
                                session.lastActive!.toLocal(),
                              ),
                            if (session.ip != null) session.ip!,
                          ].join(' · '),
                        ),
                        trailing: session.current
                            ? const Icon(Icons.check_circle_outline_rounded)
                            : IconButton(
                                tooltip: l10n.securityRevokeSession,
                                onPressed: _busy
                                    ? null
                                    : () => unawaited(
                                        _change(
                                          () => _repo.revoke(session.id),
                                          title: l10n.securityRevokeSession,
                                          description:
                                              l10n.securityRevokeDescription,
                                        ),
                                      ),
                                icon: const Icon(Icons.logout_rounded),
                              ),
                      ),
                    ),
                  if (_sessions.any((session) => !session.current))
                    Align(
                      alignment: Alignment.centerLeft,
                      child: shad.OutlineButton(
                        alignment: Alignment.center,
                        onPressed: _busy
                            ? null
                            : () => unawaited(
                                _change(
                                  _repo.revokeOthers,
                                  title: l10n.securityRevokeOthers,
                                  description: l10n.securityRevokeDescription,
                                ),
                              ),
                        child: Text(l10n.securityRevokeOthers),
                      ),
                    ),
                  const SizedBox(height: 28),
                  Text(
                    l10n.securityConnectionsTitle,
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const SizedBox(height: 8),
                  Text(l10n.securityConnectionsDescription),
                  const SizedBox(height: 12),
                  for (final identity in _identities)
                    Card(
                      child: ListTile(
                        leading: const Icon(Icons.link_rounded),
                        title: Text(identity.provider),
                        subtitle: Text(
                          identity.identityData?['email']?.toString() ?? '',
                        ),
                        trailing: IconButton(
                          tooltip: l10n.securityDisconnect,
                          onPressed: _busy || _identities.length < 2
                              ? null
                              : () => unawaited(
                                  _change(
                                    () => _repo.unlink(identity),
                                    title: l10n.securityDisconnect,
                                    description:
                                        l10n.securityDisconnectDescription,
                                  ),
                                ),
                          icon: const Icon(Icons.link_off_rounded),
                        ),
                      ),
                    ),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      for (final entry in {
                        OAuthProvider.google: 'Google',
                        OAuthProvider.apple: 'Apple',
                        OAuthProvider.github: 'GitHub',
                        OAuthProvider.azure: 'Microsoft',
                      }.entries)
                        if (!_identities.any(
                          (identity) => identity.provider == entry.key.name,
                        ))
                          shad.OutlineButton(
                            alignment: Alignment.center,
                            onPressed: _busy
                                ? null
                                : () async {
                                    setState(() => _busy = true);
                                    try {
                                      await _repo.link(entry.key);
                                    } on Object {
                                      if (mounted) {
                                        setState(() => _failed = true);
                                      }
                                    } finally {
                                      if (mounted) {
                                        setState(() => _busy = false);
                                      }
                                    }
                                  },
                            child: Text(
                              '${l10n.securityConnect} ${entry.value}',
                            ),
                          ),
                    ],
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
