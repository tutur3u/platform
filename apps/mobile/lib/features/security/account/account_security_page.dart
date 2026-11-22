import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/startup/foreground_refresh.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/security/account/account_connections_section.dart';
import 'package:mobile/features/security/account/account_security_repository.dart';
import 'package:mobile/features/security/account/account_session_tile.dart';
import 'package:mobile/features/security/data/local_auth_service.dart';
import 'package:mobile/features/security/presentation/security_labels.dart';
import 'package:mobile/features/security/presentation/session_presentation.dart';
import 'package:mobile/features/settings/view/settings_dialogs.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class AccountSecurityPage extends StatefulWidget {
  const AccountSecurityPage({this.repository, this.localAuth, super.key});
  final AccountSecurityRepository? repository;

  /// Device verification before any sign-out or disconnect. Tests inject it;
  /// the app uses [DeviceLocalAuthService].
  final LocalAuthService? localAuth;
  @override
  State<AccountSecurityPage> createState() => _AccountSecurityPageState();
}

class _AccountSecurityPageState extends State<AccountSecurityPage>
    with WidgetsBindingObserver {
  late final AccountSecurityRepository _repo =
      widget.repository ?? AccountSecurityRepository();
  List<AccountSession> _sessions = [];
  List<UserIdentity> _identities = [];
  SecurityListLoad _sessionsLoad = SecurityListLoad.loading;
  SecurityListLoad _identitiesLoad = SecurityListLoad.loading;
  bool _busy = false;

  /// A sign-out, disconnect or connect request did not go through.
  bool _actionFailed = false;

  /// A refresh of lists already on screen failed, so shown items may be stale.
  bool _refreshFailed = false;
  Future<void>? _inFlightLoad;
  int _generation = 0;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    unawaited(_load(notify: false));
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      ForegroundRefresh.request(this, () {
        if (mounted && !_busy) unawaited(_load());
      });
    }
  }

  static Future<T?> _attempt<T>(Future<T> Function() load) async {
    try {
      return await load();
    } on Object {
      return null;
    }
  }

  /// Sessions and connections load in order but fail separately, so a
  /// failing sessions endpoint never hides the sign-in methods.
  /// Overlapping refreshes coalesce unless [force] starts a post-mutation read.
  Future<void> _load({bool notify = true, bool force = false}) {
    final existing = _inFlightLoad;
    if (!force && existing != null) return existing;
    late final Future<void> future;
    future = _performLoad(notify: notify).whenComplete(() {
      if (identical(_inFlightLoad, future)) {
        _inFlightLoad = null;
        if (mounted) setState(() {});
      }
    });
    _inFlightLoad = future;
    return future;
  }

  Future<void> _performLoad({required bool notify}) async {
    final generation = ++_generation;
    final userId = Supabase.instance.client.auth.currentUser?.id;
    const failed = SecurityListLoad.failed;
    if (notify && mounted) {
      // Switch failed sections back to skeletons and mark Retry busy.
      setState(() {
        if (_sessionsLoad == failed) _sessionsLoad = SecurityListLoad.loading;
        if (_identitiesLoad == failed) {
          _identitiesLoad = SecurityListLoad.loading;
        }
      });
    }
    final sessions = await _attempt(_repo.sessions);
    final identities = await _attempt(_repo.identities);
    if (!mounted || generation != _generation) return;
    // Lists fetched for an account that has since signed out are dropped.
    final sameAccount = Supabase.instance.client.auth.currentUser?.id == userId;
    setState(() {
      final sessionsShown = _sessionsLoad == SecurityListLoad.ready;
      final identitiesShown = _identitiesLoad == SecurityListLoad.ready;
      if (sameAccount && sessions != null) {
        _sessions = sessions;
        _sessionsLoad = SecurityListLoad.ready;
      } else if (!sessionsShown) {
        _sessionsLoad = failed;
      }
      if (sameAccount && identities != null) {
        _identities = identities;
        _identitiesLoad = SecurityListLoad.ready;
      } else if (!identitiesShown) {
        _identitiesLoad = failed;
      }
      if (sameAccount) {
        _refreshFailed =
            (sessions == null && sessionsShown) ||
            (identities == null && identitiesShown);
      } else {
        _refreshFailed = false;
      }
    });
  }

  /// Every account change keeps the same gate: an in-app confirmation, then
  /// device verification, then a check that the signed-in account is still
  /// the one that asked.
  Future<void> _change(
    Future<void> Function() action, {
    required String title,
    required String description,
    required String confirmLabel,
    required IconData icon,
    String? successMessage,
  }) async {
    if (_busy) return;
    final userId = Supabase.instance.client.auth.currentUser?.id;
    final reason = context.l10n.deviceMfaVerifyReason;
    final confirmed = await showSettingsConfirmationDialog(
      context: context,
      title: title,
      description: description,
      confirmLabel: confirmLabel,
      icon: icon,
      isDestructive: true,
    );
    if (!mounted || confirmed != true) return;
    setState(() {
      _busy = true;
      _actionFailed = false;
    });
    var changed = false;
    try {
      final localAuth = widget.localAuth ?? DeviceLocalAuthService();
      if (!await localAuth.authenticate(reason: reason)) return;
      if (Supabase.instance.client.auth.currentUser?.id != userId) return;
      await action();
      changed = true;
      await _load(force: true);
    } on Object {
      if (mounted) setState(() => _actionFailed = true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
    if (changed && mounted && successMessage != null) {
      showAppToast(
        context,
        message: successMessage,
        variant: AppAlertVariant.success,
      );
    }
  }

  void _signOutSession(AccountSession session, String label) {
    final l10n = context.l10n;
    unawaited(
      _change(
        () => _repo.revoke(session.id),
        title: l10n.securitySessionSignOutConfirmTitle(label),
        description: l10n.securitySessionSignOutConfirmMessage,
        confirmLabel: l10n.securitySessionSignOut,
        icon: LucideIcons.logOut,
        successMessage: l10n.securitySessionSignedOut,
      ),
    );
  }

  /// Revokes every other session the server knows about, including ones that
  /// started after this list loaded, so the confirmation names no count.
  void _signOutOthers() {
    final l10n = context.l10n;
    unawaited(
      _change(
        _repo.revokeOthers,
        title: l10n.securitySessionsSignOutOthersConfirmTitle,
        description: l10n.securitySessionsSignOutOthersConfirmMessage,
        confirmLabel: l10n.securitySessionsSignOutOthersAction,
        icon: LucideIcons.logOut,
        successMessage: l10n.securitySessionsSignedOutOthers,
      ),
    );
  }

  void _disconnect(UserIdentity identity) {
    final l10n = context.l10n;
    unawaited(
      _change(
        () => _repo.unlink(identity),
        title: l10n.securityDisconnect,
        description: l10n.securityDisconnectDescription,
        confirmLabel: l10n.securityDisconnect,
        icon: LucideIcons.unlink,
      ),
    );
  }

  Future<void> _connect(OAuthProvider provider) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _actionFailed = false;
    });
    try {
      await _repo.link(provider);
    } on Object {
      if (mounted) setState(() => _actionFailed = true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final refreshing = _inFlightLoad != null;
    final now = DateTime.now();
    final groups = groupSessions(
      _sessions,
      isCurrent: (session) => session.current,
      lastActive: (session) => session.lastActive,
      now: now,
    );
    final others = groups.others;
    final ordered = <AccountSession>[
      ?groups.current,
      ...groups.recent,
      ...groups.older,
    ];
    final baseLabels = <String, String>{};
    final identityParts = <SessionIdentityPart>[];
    for (final session in ordered) {
      final client = describeSessionUserAgent(session.label);
      final label = sessionClientLabel(
        l10n,
        client,
        localPlatform: session.current ? currentAppPlatform() : null,
      );
      baseLabels[session.id] = label;
      final maskedIp = maskSessionIp(session.ip);
      final lastActive = session.lastActive == null
          ? null
          : sessionLastActiveLabel(context, session.lastActive!, now: now);
      final contextParts = [?maskedIp, ?lastActive];
      identityParts.add(
        SessionIdentityPart(
          id: session.id,
          label: label,
          context: contextParts.isEmpty ? null : contextParts.join(', '),
        ),
      );
    }
    final disambiguations = disambiguateSessionIdentifiers(identityParts);

    Widget sessionTile(AccountSession session) {
      final label = baseLabels[session.id]!;
      final disambiguation = disambiguations[session.id];
      final identifier = formatSessionIdentifier(l10n, label, disambiguation);
      return AccountSessionTile(
        key: ValueKey(session.id),
        session: session,
        now: now,
        busy: _busy,
        ordinal: disambiguation?.ordinal,
        identifier: identifier,
        onSignOut: session.current
            ? null
            : (target) => _signOutSession(session, target),
      );
    }

    return NovaRefreshIndicator(
      onRefresh: _load,
      child: AppPageListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          if (_actionFailed) ...[
            AppAlert.destructive(
              title: Text(l10n.securitySessionsActionFailed),
            ),
            const SizedBox(height: AppLayout.sectionGap),
          ],
          if (_refreshFailed) ...[
            AppAlert.destructive(
              title: Text(l10n.securitySessionsRefreshFailed),
              trailing: AppButton.outline(
                size: AppButtonSize.small,
                loading: refreshing,
                onPressed: _busy || refreshing
                    ? null
                    : () => unawaited(_load()),
                child: Text(l10n.commonRetry),
              ),
            ),
            const SizedBox(height: AppLayout.sectionGap),
          ],
          if (_sessionsLoad == SecurityListLoad.loading) ...[
            AppGroupedSection.spaced(
              caption: l10n.securitySessionsThisDevice,
              children: const [AppSkeletonRows(count: 1)],
            ),
            AppGroupedSection.spaced(
              caption: l10n.securitySessionsRecent,
              children: const [AppSkeletonRows(count: 3)],
            ),
          ] else if (_sessionsLoad == SecurityListLoad.failed) ...[
            AppStateMessage(
              icon: LucideIcons.monitorSmartphone,
              title: l10n.securitySessionsLoadFailedTitle,
              message: l10n.securitySessionsLoadFailedMessage,
              tone: AppTone.destructive,
              actionLabel: l10n.commonRetry,
              onAction: _load,
            ),
            const SizedBox(height: AppLayout.sectionGap),
          ] else ...[
            if (groups.current case final current?)
              AppGroupedSection.spaced(
                caption: l10n.securitySessionsThisDevice,
                children: [sessionTile(current)],
              ),
            if (groups.recent.isNotEmpty)
              AppGroupedSection.spaced(
                caption: l10n.securitySessionsRecent,
                captionTrailing: _CaptionCount(groups.recent.length),
                children: [for (final s in groups.recent) sessionTile(s)],
              ),
            if (groups.older.isNotEmpty)
              AppGroupedSection.spaced(
                caption: l10n.securitySessionsOlder,
                captionTrailing: _CaptionCount(groups.older.length),
                children: [for (final s in groups.older) sessionTile(s)],
              ),
            if (others.isEmpty)
              AppGroupedSection.spaced(
                children: [
                  AppStateMessage.inline(
                    icon: LucideIcons.shieldCheck,
                    tone: AppTone.success,
                    title: l10n.securitySessionsNoOthersTitle,
                    message: l10n.securitySessionsNoOthersMessage,
                  ),
                ],
              )
            else
              AppGroupedSection.spaced(
                footer: l10n.securitySessionsStaysSignedIn,
                children: [
                  _DestructiveRow(
                    icon: LucideIcons.logOut,
                    label: l10n.securitySessionsSignOutOthers,
                    onTap: _busy ? null : _signOutOthers,
                  ),
                ],
              ),
          ],
          AccountConnectionsSection(
            load: _identitiesLoad,
            identities: _identities,
            busy: _busy,
            onDisconnect: _disconnect,
            onConnect: (provider) => unawaited(_connect(provider)),
            onRetry: () => unawaited(_load()),
          ),
        ],
      ),
    );
  }
}

class _CaptionCount extends StatelessWidget {
  const _CaptionCount(this.count);

  final int count;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Text(
      '$count',
      style: theme.textTheme.labelLarge?.copyWith(
        color: theme.colorScheme.onSurfaceVariant,
        fontFeatures: const [FontFeature.tabularFigures()],
      ),
    );
  }
}

/// A full-width destructive action inside a grouped card.
class _DestructiveRow extends StatelessWidget {
  const _DestructiveRow({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final color = onTap == null
        ? tokens.colorScheme.mutedForeground
        : tokens.colorScheme.destructive;
    return Semantics(
      button: true,
      enabled: onTap != null,
      child: InkWell(
        onTap: onTap,
        child: ConstrainedBox(
          constraints: BoxConstraints(minHeight: tokens.interface.rowMinHeight),
          child: Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: AppLayout.rowHorizontalPadding,
              vertical: AppSpacing.md,
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(icon, size: 18, color: color),
                const SizedBox(width: AppSpacing.sm),
                Flexible(
                  child: Text(
                    label,
                    textAlign: TextAlign.center,
                    style: tokens.typography.base.copyWith(
                      color: color,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
