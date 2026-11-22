import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/security/mfa_approval/data/mfa_approval_repository.dart';
import 'package:mobile/features/security/mfa_approval/view/mfa_approval_dialog.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;
import 'package:supabase_flutter/supabase_flutter.dart';

/// Notifications carry identifiers only. Always re-read the authorized request.
class MfaRequestPage extends StatefulWidget {
  const MfaRequestPage({
    required this.challengeId,
    required this.userId,
    super.key,
  });
  final String challengeId;
  final String userId;
  @override
  State<MfaRequestPage> createState() => _MfaRequestPageState();
}

class _MfaRequestPageState extends State<MfaRequestPage> {
  final _repository = MfaApprovalRepository();
  bool _loading = true;
  bool _failed = false;
  bool _requiresMfa = false;
  PendingMfaApproval? _approval;

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  Future<void> _load() async {
    if (Supabase.instance.client.auth.currentUser?.id != widget.userId) {
      setState(() {
        _loading = false;
        _failed = true;
      });
      return;
    }
    final result = await _repository.listPending();
    if (!mounted) return;
    if (Supabase.instance.client.auth.currentUser?.id != widget.userId) {
      setState(() {
        _loading = false;
        _failed = true;
        _approval = null;
      });
      return;
    }
    setState(() {
      _loading = false;
      _failed = result.error != null;
      _requiresMfa = result.requiresMobileMfa;
      _approval = result.approvals
          .where((a) => a.id == widget.challengeId)
          .firstOrNull;
    });
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    // A failed or MFA-gated read never offers review, as before.
    final approval = _failed || _requiresMfa ? null : _approval;
    final (IconData icon, AppTone tone, String? message) = _loading
        ? (LucideIcons.shieldCheck, AppTone.primary, null)
        : _failed
        ? (LucideIcons.shieldAlert, AppTone.destructive, l10n.deviceMfaError)
        : _requiresMfa
        ? (
            LucideIcons.shieldAlert,
            AppTone.warning,
            l10n.mfaApprovalRequiresMobileMfa,
          )
        : approval == null
        ? (LucideIcons.clock, AppTone.neutral, l10n.deviceMfaExpired)
        : (LucideIcons.shieldCheck, AppTone.primary, l10n.deviceMfaNumberHint);
    return shad.Scaffold(
      child: AppPageBody(
        kind: AppPageKind.form,
        child: Center(
          child: SingleChildScrollView(
            child: _loading
                ? const AppLoadingIndicator()
                : Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Center(
                        child: AppIconTile(icon: icon, tone: tone, size: 56),
                      ),
                      const SizedBox(height: AppSpacing.lg),
                      Semantics(
                        header: true,
                        child: Text(
                          l10n.deviceMfaNumberTitle,
                          textAlign: TextAlign.center,
                          style: AppTokens.of(context).typography.h4,
                        ),
                      ),
                      if (message != null) ...[
                        const SizedBox(height: AppSpacing.sm),
                        Semantics(
                          liveRegion: tone == AppTone.destructive,
                          child: Text(
                            message,
                            textAlign: TextAlign.center,
                            style: AppTokens.of(context).typography.small
                                .copyWith(
                                  color: AppTokens.of(
                                    context,
                                  ).colorScheme.mutedForeground,
                                ),
                          ),
                        ),
                      ],
                      const SizedBox(height: AppSpacing.xl),
                      if (approval != null) ...[
                        AppButton.primary(
                          onPressed: () async {
                            await showMfaApprovalDialog(
                              context,
                              approval,
                              _repository,
                            );
                            if (mounted) await _load();
                          },
                          child: Text(l10n.deviceMfaReview),
                        ),
                        const SizedBox(height: AppSpacing.sm),
                      ],
                      AppButton.ghost(
                        onPressed: () => context.go(Routes.settingsSession),
                        child: Text(l10n.deviceMfaTitle),
                      ),
                    ],
                  ),
          ),
        ),
      ),
    );
  }
}
