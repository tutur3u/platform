import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/security/account/account_security_repository.dart';
import 'package:mobile/features/security/presentation/security_labels.dart';
import 'package:mobile/features/security/presentation/session_presentation.dart';
import 'package:mobile/l10n/l10n.dart';

/// One signed-in session: a friendly client label, relative last-active time
/// (absolute on hover or long-press) and a masked address. Tapping the row
/// reveals the raw user agent, full address and timestamps.
class AccountSessionTile extends StatefulWidget {
  const AccountSessionTile({
    required this.session,
    required this.now,
    required this.busy,
    this.identifier,
    this.onSignOut,
    super.key,
  });

  final AccountSession session;
  final DateTime now;
  final bool busy;

  /// Disambiguated identifier used for accessible labels and confirmation
  /// prompts when multiple sessions share the same client label.
  final String? identifier;

  /// Null for this device's own session, which cannot be signed out here.
  final ValueChanged<String>? onSignOut;

  @override
  State<AccountSessionTile> createState() => _AccountSessionTileState();
}

class _AccountSessionTileState extends State<AccountSessionTile> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    final session = widget.session;
    final client = describeSessionUserAgent(session.label);
    final label = sessionClientLabel(
      l10n,
      client,
      localPlatform: session.current ? currentAppPlatform() : null,
    );
    final accessibleLabel = widget.identifier ?? label;
    final lastActive = session.lastActive;
    final relative = lastActive == null
        ? null
        : sessionLastActiveLabel(context, lastActive, now: widget.now);
    final maskedIp = maskSessionIp(session.ip);
    final summary = [?relative, ?maskedIp].join(' · ');
    final onSignOut = widget.onSignOut;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        Semantics(
          expanded: _expanded,
          child: AppGroupedRow(
            semanticLabel: accessibleLabel == label ? null : accessibleLabel,
            onTap: () => setState(() => _expanded = !_expanded),
            leading: AppIconTile(
              icon: sessionClientIcon(client),
              tone: session.current ? AppTone.success : AppTone.neutral,
            ),
            title: Text(label),
            subtitle: summary.isEmpty
                ? null
                : lastActive == null
                ? Text(summary)
                : AppTooltip(
                    message: securityDateTime(context, lastActive),
                    child: Text(summary),
                  ),
            trailing: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (onSignOut != null)
                  AppIconButton(
                    tooltip: l10n.securitySessionSignOutNamed(accessibleLabel),
                    onPressed: widget.busy
                        ? null
                        : () => onSignOut(accessibleLabel),
                    icon: const Icon(LucideIcons.logOut, size: 18),
                  ),
                ExcludeSemantics(
                  child: AnimatedRotation(
                    turns: _expanded ? 0.5 : 0,
                    duration: AppMotion.fast,
                    child: Icon(
                      LucideIcons.chevronDown,
                      size: 18,
                      color: tokens.colorScheme.mutedForeground,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
        AnimatedSize(
          duration: AppMotion.fast,
          alignment: Alignment.topCenter,
          child: _expanded
              ? _SessionDetails(
                  session: session,
                  busy: widget.busy,
                  signOutSemanticLabel: l10n.securitySessionSignOutNamed(
                    accessibleLabel,
                  ),
                  onSignOut: onSignOut == null
                      ? null
                      : () => onSignOut(accessibleLabel),
                )
              : const SizedBox(width: double.infinity),
        ),
      ],
    );
  }
}

class _SessionDetails extends StatelessWidget {
  const _SessionDetails({
    required this.session,
    required this.busy,
    this.signOutSemanticLabel,
    this.onSignOut,
  });

  final AccountSession session;
  final bool busy;
  final String? signOutSemanticLabel;
  final VoidCallback? onSignOut;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final ip = sessionIpAddress(session.ip);
    const rowPadding = EdgeInsets.symmetric(vertical: AppSpacing.xs);
    return Padding(
      padding: const EdgeInsetsDirectional.fromSTEB(
        AppLayout.rowDividerInset,
        0,
        AppLayout.rowHorizontalPadding,
        AppSpacing.md,
      ),
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: c.muted,
          borderRadius: tokens.interface.borderRadius(AppRadius.md),
        ),
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.md),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (session.lastActive case final at?)
                AppKeyValueRow(
                  label: l10n.securitySessionLastActive,
                  value: securityDateTime(context, at),
                  padding: rowPadding,
                ),
              if (session.createdAt case final at?)
                AppKeyValueRow(
                  label: l10n.securitySessionSignedIn,
                  value: securityDateTime(context, at),
                  padding: rowPadding,
                ),
              if (ip != null)
                AppKeyValueRow(
                  label: l10n.securitySessionIpAddress,
                  value: ip,
                  padding: rowPadding,
                ),
              if (session.label.trim().isNotEmpty) ...[
                const SizedBox(height: AppSpacing.xs),
                Text(
                  l10n.securitySessionUserAgent,
                  style: tokens.typography.small.copyWith(
                    color: c.mutedForeground,
                  ),
                ),
                const SizedBox(height: AppSpacing.xxs),
                SelectableText(
                  session.label,
                  style: tokens.typography.xSmall.copyWith(
                    fontFamily: 'monospace',
                    color: c.foreground,
                    height: 1.45,
                  ),
                ),
              ],
              if (onSignOut case final signOut?) ...[
                const SizedBox(height: AppSpacing.md),
                Align(
                  alignment: AlignmentDirectional.centerStart,
                  child: AppButton.outline(
                    size: AppButtonSize.small,
                    leading: const Icon(LucideIcons.logOut, size: 16),
                    semanticLabel: signOutSemanticLabel,
                    onPressed: busy ? null : signOut,
                    child: Text(l10n.securityRevokeSession),
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
