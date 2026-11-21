import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_clock.dart';
import 'package:mobile/features/mastermind/fleet_access/cubit/fleet_link_cubit.dart';
import 'package:mobile/features/mastermind/fleet_access/data/fleet_access_models.dart';
import 'package:mobile/features/mastermind/fleet_access/view/fleet_access_labels.dart';
import 'package:mobile/features/mastermind/fleet_access/view/fleet_access_notice.dart';
import 'package:mobile/features/mastermind/fleet_access/view/fleet_link_code_block.dart';
import 'package:mobile/features/mastermind/view/widgets/mastermind_group.dart';
import 'package:mobile/features/mastermind/view/widgets/mastermind_list_row.dart';
import 'package:mobile/l10n/l10n.dart';

/// Link chat identity: take a single-use code, send it to Mira in a private
/// chat, paste the link id and confirmation code Mira replies with, check
/// which channel and desk account it names, then confirm.
class FleetLinkView extends StatelessWidget {
  const FleetLinkView({required this.cubit, this.now, super.key});

  final FleetLinkCubit cubit;
  final DateTime Function()? now;

  @override
  Widget build(BuildContext context) =>
      BlocBuilder<FleetLinkCubit, FleetLinkState>(
        bloc: cubit,
        builder: (context, state) => Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          spacing: AppSpacing.lg,
          children: [
            if (state.failure case final failure?)
              FleetAccessNotice(failure: failure),
            switch (state.step) {
              FleetLinkStep.idle || FleetLinkStep.linked => _Start(
                state: state,
                onIssue: () => unawaited(cubit.issue()),
              ),
              FleetLinkStep.issued => _Issued(
                state: state,
                cubit: cubit,
                now: now,
              ),
              FleetLinkStep.pending => _Pending(state: state, cubit: cubit),
            },
          ],
        ),
      );
}

class _Start extends StatelessWidget {
  const _Start({required this.state, required this.onIssue});

  final FleetLinkState state;
  final VoidCallback onIssue;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final linked = state.step == FleetLinkStep.linked ? state.preview : null;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: AppSpacing.lg,
      children: [
        if (linked != null)
          AppStateMessage.inline(
            icon: LucideIcons.link,
            tone: AppTone.success,
            title: l10n.mastermindFleetAccessLinkLinked(
              linked.accountLabel,
              linked.channel.label,
            ),
          ),
        AppButton.primary(
          key: const ValueKey('fleet-access-link-start'),
          loading: state.busy,
          onPressed: state.busy ? null : onIssue,
          child: Text(l10n.mastermindFleetAccessLinkStart),
        ),
      ],
    );
  }
}

class _Issued extends StatefulWidget {
  const _Issued({required this.state, required this.cubit, this.now});

  final FleetLinkState state;
  final FleetLinkCubit cubit;
  final DateTime Function()? now;

  @override
  State<_Issued> createState() => _IssuedState();
}

class _IssuedState extends State<_Issued> {
  final _linkId = TextEditingController();
  final _confirmation = TextEditingController();
  String? _linkIdError;
  String? _confirmationError;

  @override
  void dispose() {
    _linkId.dispose();
    _confirmation.dispose();
    super.dispose();
  }

  void _check() {
    final l10n = context.l10n;
    final linkId = _linkId.text.trim();
    final confirmation = _confirmation.text.trim();
    setState(() {
      _linkIdError = isFleetUuid(linkId)
          ? null
          : l10n.mastermindFleetAccessLinkIdInvalid;
      _confirmationError = fleetLinkCodePattern.hasMatch(confirmation)
          ? null
          : l10n.mastermindFleetAccessLinkConfirmationInvalid;
    });
    if (_linkIdError != null || _confirmationError != null) return;
    unawaited(
      widget.cubit.preview(linkId: linkId, confirmationCode: confirmation),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final code = widget.state.code!;
    final busy = widget.state.busy;
    return FleetClock(
      now: widget.now,
      builder: (context, now) {
        final left = code.expiresAt.difference(now);
        final expired = left <= Duration.zero;
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          spacing: AppSpacing.lg,
          children: [
            if (expired) ...[
              AppStateMessage.inline(
                icon: LucideIcons.clock,
                title: l10n.mastermindFleetAccessLinkExpired,
              ),
              AppButton.primary(
                key: const ValueKey('fleet-access-link-new-code'),
                loading: busy,
                onPressed: busy ? null : () => unawaited(widget.cubit.issue()),
                child: Text(l10n.mastermindFleetAccessLinkNewCode),
              ),
            ] else ...[
              Text(l10n.mastermindFleetAccessLinkSendCode),
              FleetLinkCodeBlock(code: code.code),
              Text(
                l10n.mastermindFleetAccessLinkExpiresIn(
                  fleetCountdown(l10n, left),
                ),
                style: AppTokens.of(context).typography.xSmall,
              ),
              AppTextField(
                key: const ValueKey('fleet-access-link-id'),
                autocorrect: false,
                enableSuggestions: false,
                controller: _linkId,
                enabled: !busy,
                label: l10n.mastermindFleetAccessLinkIdField,
                placeholder: l10n.mastermindFleetAccessLinkFromReply,
                errorText: _linkIdError,
              ),
              AppTextField(
                key: const ValueKey('fleet-access-link-confirmation'),
                autocorrect: false,
                enableSuggestions: false,
                controller: _confirmation,
                enabled: !busy,
                label: l10n.mastermindFleetAccessLinkConfirmationField,
                placeholder: l10n.mastermindFleetAccessLinkFromReply,
                errorText: _confirmationError,
              ),
              AppButton.primary(
                key: const ValueKey('fleet-access-link-check'),
                loading: busy,
                onPressed: busy ? null : _check,
                child: Text(l10n.mastermindFleetAccessLinkCheck),
              ),
            ],
          ],
        );
      },
    );
  }
}

class _Pending extends StatelessWidget {
  const _Pending({required this.state, required this.cubit});

  final FleetLinkState state;
  final FleetLinkCubit cubit;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final preview = state.preview!;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: AppSpacing.md,
      children: [
        MastermindGroup(
          children: [
            MastermindListRow(
              title: l10n.mastermindFleetAccessLinkChannel,
              trailing: Text(preview.channel.label),
            ),
            MastermindListRow(
              title: l10n.mastermindFleetAccessLinkAccount,
              trailing: Text(preview.accountLabel),
            ),
          ],
        ),
        AppButton.primary(
          key: const ValueKey('fleet-access-link-confirm'),
          loading: state.busy,
          onPressed: state.busy ? null : () => unawaited(cubit.confirm()),
          child: Text(l10n.mastermindFleetAccessLinkConfirm),
        ),
        AppButton.ghost(
          onPressed: state.busy ? null : cubit.restart,
          child: Text(l10n.mastermindFleetAccessLinkStartOver),
        ),
      ],
    );
  }
}
