import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_secret.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_secret_binding.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_secret_pins.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_clock.dart';
import 'package:mobile/l10n/l10n.dart';

/// "Expires in 08:12" against [expiresAt], ticking every second.
class FleetSecretCountdown extends StatelessWidget {
  const FleetSecretCountdown({required this.expiresAt, this.now, super.key});

  final DateTime expiresAt;
  final DateTime Function()? now;

  @override
  Widget build(BuildContext context) => FleetClock(
    now: now,
    builder: (context, current) {
      final left = expiresAt.difference(current);
      return AppMetaItem(
        icon: LucideIcons.timer,
        label: context.l10n.mastermindFleetExpiresIn(
          fleetCountdown(context.l10n, left.isNegative ? Duration.zero : left),
        ),
      );
    },
  );
}

/// One labelled block of verified request text, in full.
class _Block extends StatelessWidget {
  const _Block({required this.label, required this.child});

  final String label;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: tokens.typography.small.copyWith(
              color: tokens.colorScheme.mutedForeground,
            ),
          ),
          const SizedBox(height: AppSpacing.xs),
          child,
        ],
      ),
    );
  }
}

/// Arguments in monospace, one per line and never shortened, each quoted
/// by [FleetSecretBinding.argument] so distinct arguments look distinct.
class _Args extends StatelessWidget {
  const _Args(this.args);

  final List<String> args;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final style = tokens.typography.small.copyWith(
      fontFamily: 'monospace',
      color: tokens.colorScheme.foreground,
    );
    return DecoratedBox(
      decoration: BoxDecoration(
        color: tokens.colorScheme.muted,
        borderRadius: BorderRadius.circular(tokens.shapes.field),
      ),
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.sm),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            for (final arg in args)
              Text(
                FleetSecretBinding.argument(arg),
                style: style,
                softWrap: true,
              ),
          ],
        ),
      ),
    );
  }
}

/// Only fields the machine signed and this phone verified, plus the pinned
/// label; the requester is what the machine reports, and the lane title is
/// unverified fleet data.
class FleetSecretRequestDetails extends StatelessWidget {
  const FleetSecretRequestDetails({
    required this.request,
    required this.pin,
    required this.requestCode,
    this.laneTitle,
    this.now,
    super.key,
  });

  final FleetSecretRequest request;
  final FleetSecretPin pin;
  final String requestCode;
  final String? laneTitle;
  final DateTime Function()? now;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    final command = request.parsedCommand;
    final remote = command.remote;
    final body = tokens.typography.body.copyWith(
      color: tokens.colorScheme.foreground,
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AppRichRow(
          title: FleetSecretBinding.visible(pin.label),
          subtitle: request.machineId,
          leading: const AppIconTile(
            icon: LucideIcons.monitor,
            tone: AppTone.warning,
          ),
        ),
        const SizedBox(height: AppSpacing.sm),
        FleetSecretCountdown(expiresAt: request.expiresAtTime, now: now),
        const SizedBox(height: AppSpacing.md),
        _Block(
          label: l10n.mastermindSecretPurpose,
          child: Text(FleetSecretBinding.visible(request.purpose), style: body),
        ),
        _Block(
          label: l10n.mastermindSecretCommand,
          child: _Args(
            remote == null
                ? command.argv
                : command.argv.sublist(0, command.argv.length - 1),
          ),
        ),
        if (remote != null)
          _Block(label: l10n.mastermindSecretRemote, child: _Args(remote)),
        AppKeyValueRow(
          label: l10n.mastermindSecretOutput,
          value: request.outputToAgent
              ? l10n.mastermindSecretOutputAgent
              : l10n.mastermindSecretOutputWithheld,
        ),
        AppKeyValueRow(
          label: l10n.mastermindSecretRequester,
          value: l10n.mastermindSecretReported(request.requester),
        ),
        if (laneTitle case final title?)
          Text(
            l10n.mastermindSecretLaneFleetData(
              FleetSecretBinding.visible(title),
            ),
            style: tokens.typography.small.copyWith(
              color: tokens.colorScheme.mutedForeground,
            ),
          ),
        AppKeyValueRow(
          label: l10n.mastermindSecretRequestCode,
          value: requestCode,
        ),
      ],
    );
  }
}

/// A pairing shows the machine as it names itself, its key fingerprint and
/// the countdown. Nothing here is trusted until the typed code matches.
class FleetSecretPairDetails extends StatelessWidget {
  const FleetSecretPairDetails({
    required this.pairing,
    required this.fingerprint,
    this.now,
    super.key,
  });

  final FleetSecretPairing pairing;
  final String fingerprint;
  final DateTime Function()? now;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AppRichRow(
          title: FleetSecretBinding.visible(pairing.machineLabel),
          subtitle: pairing.machineId,
          leading: const AppIconTile(
            icon: LucideIcons.link,
            tone: AppTone.warning,
          ),
        ),
        const SizedBox(height: AppSpacing.sm),
        FleetSecretCountdown(expiresAt: pairing.expiresAtTime, now: now),
        const SizedBox(height: AppSpacing.md),
        _Block(
          label: l10n.mastermindSecretMachineKey,
          child: Text(
            fingerprint,
            style: tokens.typography.small.copyWith(
              fontFamily: 'monospace',
              color: tokens.colorScheme.foreground,
            ),
          ),
        ),
      ],
    );
  }
}
