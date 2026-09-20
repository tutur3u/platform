import 'dart:async';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
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
    return shad.Scaffold(
      child: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.verified_user_outlined, size: 40),
                  const shad.Gap(16),
                  Text(
                    l10n.deviceMfaNumberTitle,
                    style: shad.Theme.of(context).typography.h3,
                  ),
                  const shad.Gap(16),
                  if (_loading)
                    const shad.CircularProgressIndicator()
                  else if (_failed)
                    Text(l10n.deviceMfaError)
                  else if (_requiresMfa)
                    Text(l10n.mfaApprovalRequiresMobileMfa)
                  else if (_approval == null)
                    Text(l10n.deviceMfaExpired)
                  else
                    shad.PrimaryButton(
                      onPressed: () async {
                        await showMfaApprovalDialog(
                          context,
                          _approval!,
                          _repository,
                        );
                        if (mounted) await _load();
                      },
                      child: Text(l10n.deviceMfaReview),
                    ),
                  const shad.Gap(16),
                  shad.OutlineButton(
                    onPressed: () => context.go(Routes.settingsSession),
                    child: Text(l10n.deviceMfaTitle),
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
