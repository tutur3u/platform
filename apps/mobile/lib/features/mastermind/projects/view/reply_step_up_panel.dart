import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile/core/input/platform_text_context_menu.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_reply_step_up.dart';
import 'package:mobile/l10n/l10n.dart';

/// Renews the second factor in place, under a reply that needs it: with this
/// device when it is an authenticator, or with a six-digit code. Verified,
/// [onVerified] sends the same reply again under its key; a dismissed device
/// unlock changes nothing; a failure says so and can be tried again.
class ReplyStepUpPanel extends StatefulWidget {
  const ReplyStepUpPanel({
    required this.stepUp,
    required this.onVerified,
    super.key,
  });

  final FleetReplyStepUp stepUp;
  final VoidCallback onVerified;

  @override
  State<ReplyStepUpPanel> createState() => _ReplyStepUpPanelState();
}

class _ReplyStepUpPanelState extends State<ReplyStepUpPanel> {
  late final Future<bool> _registered = widget.stepUp.deviceRegistered();
  final _code = TextEditingController();
  bool _busy = false;
  bool _failed = false;

  @override
  void initState() {
    super.initState();
    _code.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  Future<void> _verify(Future<FleetStepUpResult> Function() attempt) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _failed = false;
    });
    final result = await attempt();
    if (!mounted) return;
    setState(() {
      _busy = false;
      _failed = result == FleetStepUpResult.failed;
    });
    if (result == FleetStepUpResult.verified) widget.onVerified();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final colors = AppTokens.of(context).colorScheme;
    final complete = RegExp(r'^\d{6}$').hasMatch(_code.text.trim());
    return Padding(
      padding: const EdgeInsets.only(top: AppSpacing.sm),
      child: FutureBuilder<bool>(
        future: _registered,
        builder: (context, registered) => Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (registered.data ?? false) ...[
              AppButton(
                key: const ValueKey('projects-step-up-device'),
                size: AppButtonSize.small,
                enabled: !_busy,
                leading: const Icon(LucideIcons.fingerprint),
                onPressed: () => unawaited(
                  _verify(
                    () => widget.stepUp.withDevice(
                      reason: l10n.mastermindProjectsStepUpReason,
                    ),
                  ),
                ),
                child: Text(l10n.mastermindProjectsVerifyDevice),
              ),
              const SizedBox(height: AppSpacing.sm),
            ],
            Row(
              children: [
                Expanded(
                  child: AppTextField(
                    key: const ValueKey('projects-step-up-code'),
                    controller: _code,
                    placeholder: l10n.mastermindProjectsStepUpCode,
                    keyboardType: TextInputType.number,
                    autofillHints: const [AutofillHints.oneTimeCode],
                    inputFormatters: [
                      FilteringTextInputFormatter.digitsOnly,
                      LengthLimitingTextInputFormatter(6),
                    ],
                    contextMenuBuilder: platformTextContextMenuBuilder(),
                    selectionControls: platformTextSelectionControls(),
                    enabled: !_busy,
                  ),
                ),
                const SizedBox(width: AppSpacing.sm),
                AppButton(
                  key: const ValueKey('projects-step-up-verify'),
                  size: AppButtonSize.small,
                  variant: AppButtonVariant.outline,
                  loading: _busy,
                  onPressed: complete && !_busy
                      ? () => unawaited(
                          _verify(() => widget.stepUp.withCode(_code.text)),
                        )
                      : null,
                  child: Text(l10n.mastermindProjectsStepUpVerify),
                ),
              ],
            ),
            if (_failed)
              Padding(
                padding: const EdgeInsets.only(top: AppSpacing.xs),
                child: Text(
                  l10n.mastermindProjectsStepUpFailed,
                  style: TextStyle(color: colors.destructive, fontSize: 12),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
