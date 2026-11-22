import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/layout/page_insets.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/repositories/auth_repository.dart';
import 'package:mobile/features/mastermind/fleet/cubit/fleet_secret_cubit.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_models.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_reply_step_up.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_repository.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_secret_answer.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_secret_crypto.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_secret_pins.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_secret_details.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_secret_field.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_secret_status.dart';
import 'package:mobile/features/mastermind/projects/view/reply_step_up_panel.dart';
import 'package:mobile/features/mastermind/runtime/mastermind_runtime.dart';
import 'package:mobile/l10n/l10n.dart';

/// Opens a secret request or pairing full screen above the shell, on the
/// root navigator: no route, so no decision id ever reaches a URL.
Future<void> showFleetSecretPage(
  BuildContext context, {
  required FleetDecision decision,
  FleetSecretCrypto? crypto,
  FleetSecretPins? pins,
  FleetSecretAnswerSource? source,
  FleetReplyStepUp? stepUp,
  DateTime Function()? now,
}) {
  final runtime = context.read<MastermindRuntime>();
  final auth = context.read<AuthRepository?>();
  final userId = runtime.userId ?? () => null;
  final snapshot = runtime.fleet.state.snapshot;
  return Navigator.of(context, rootNavigator: true).push<void>(
    FleetSecretRoute(
      builder: (_) => FleetSecretPage(
        decision: decision,
        now: now,
        laneTitle: snapshot?.lanes
            .where((lane) => lane.id == decision.laneId)
            .firstOrNull
            ?.title,
        stepUp: stepUp ?? (auth == null ? null : FleetReplyStepUp(auth: auth)),
        create: () => FleetSecretCubit(
          decision: decision,
          crypto: crypto ?? FleetSecretCrypto.instance,
          pins: pins ?? FleetSecretPins(userId: userId),
          source: source ?? FleetRepository(),
          accountId: userId,
          snapshot: snapshot,
          snapshots: runtime.fleet.stream.map((state) => state.snapshot),
          now: now,
          onHandled: () {
            runtime.fleet.markSecretHandled(decision.id);
            unawaited(runtime.fleet.refresh());
          },
        ),
      ),
    ),
  );
}

/// The secret page's full-screen route. Completing it, by a pop or by a
/// removal that never pops (its parent page replaced), runs the page's
/// hooks synchronously, before the exit transition or disposal.
class FleetSecretRoute extends MaterialPageRoute<void> {
  FleetSecretRoute({required super.builder}) : super(fullscreenDialog: true);

  final _completeHooks = <VoidCallback>{};

  /// Runs [hook] when this route completes; adding the same hook twice
  /// keeps one.
  void onComplete(VoidCallback hook) => _completeHooks.add(hook);

  @override
  void didComplete(void result) {
    for (final hook in List.of(_completeHooks)) {
      hook();
    }
    super.didComplete(result);
  }
}

/// Verified request (or pairing) details, the step-up, then the one input.
class FleetSecretPage extends StatelessWidget {
  const FleetSecretPage({
    required this.decision,
    required this.create,
    required this.stepUp,
    this.laneTitle,
    this.now,
    super.key,
  });

  final FleetDecision decision;
  final FleetSecretCubit Function() create;
  final FleetReplyStepUp? stepUp;

  /// The lane title from the snapshot: fleet data, never verified.
  final String? laneTitle;
  final DateTime Function()? now;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final l10n = context.l10n;
    final pairing = decision.secret is FleetSecretPairing;
    return BlocProvider(
      create: (_) {
        final cubit = create();
        unawaited(cubit.start());
        return cubit;
      },
      child: Builder(
        // Fence dispatch the moment the route completes (Close, Done, system
        // Back, or removal under a parent), not once the page is disposed.
        builder: (context) {
          final leave = context.read<FleetSecretCubit>().leave;
          if (ModalRoute.of(context) case final FleetSecretRoute route) {
            route.onComplete(leave);
          }
          return PopScope(
            onPopInvokedWithResult: (didPop, _) {
              if (didPop) leave();
            },
            child: _scaffold(context, tokens, l10n, pairing),
          );
        },
      ),
    );
  }

  Widget _scaffold(
    BuildContext context,
    AppTokens tokens,
    AppLocalizations l10n,
    bool pairing,
  ) => Scaffold(
    backgroundColor: tokens.colorScheme.background,
    body: SafeArea(
      child: Column(
        children: [
          ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 56),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: Row(
                spacing: 8,
                children: [
                  AppIconButton(
                    icon: const Icon(LucideIcons.x),
                    tooltip: l10n.mastermindSecretClose,
                    onPressed: () => Navigator.of(context).maybePop(),
                  ),
                  Expanded(
                    child: Semantics(
                      header: true,
                      child: Text(
                        pairing
                            ? l10n.mastermindSecretPairTitle
                            : l10n.mastermindSecretRequestTitle,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: tokens.typography.title,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
          Expanded(
            child: BlocBuilder<FleetSecretCubit, FleetSecretState>(
              builder: (context, state) => _Body(
                state: state,
                secret: decision.secret!,
                stepUp: stepUp,
                laneTitle: laneTitle,
                now: now,
              ),
            ),
          ),
        ],
      ),
    ),
  );
}

class _Body extends StatelessWidget {
  const _Body({
    required this.state,
    required this.secret,
    required this.stepUp,
    required this.laneTitle,
    required this.now,
  });

  final FleetSecretState state;
  final FleetSecret secret;
  final FleetReplyStepUp? stepUp;
  final String? laneTitle;
  final DateTime Function()? now;

  static const Set<FleetSecretPhase> _verified = {
    FleetSecretPhase.stepUp,
    FleetSecretPhase.input,
    FleetSecretPhase.sealing,
    FleetSecretPhase.sent,
    FleetSecretPhase.pickedUp,
    FleetSecretPhase.outcome,
  };

  @override
  Widget build(BuildContext context) {
    if (state.phase == FleetSecretPhase.verifying) {
      return const Center(child: AppLoadingIndicator.page());
    }
    final l10n = context.l10n;
    final cubit = context.read<FleetSecretCubit>();
    final secret = this.secret;
    final request = secret is FleetSecretRequest ? secret : null;
    final declinable =
        request != null &&
        !state.resend &&
        (state.phase == FleetSecretPhase.stepUp ||
            state.phase == FleetSecretPhase.input);
    // Forget stays reachable whenever the stored trust offers it, including
    // on the pairing page and while a re-pairing waits for the machine.
    final forgettable =
        state.forgettable ||
        (request != null &&
            (state.block == FleetSecretBlock.keyChanged ||
                state.block == FleetSecretBlock.notInAudience ||
                state.block == FleetSecretBlock.pendingPin));
    return LayoutBuilder(
      builder: (context, constraints) {
        final gutter = AppPageInsets.gutterOf(
          context,
          width: constraints.maxWidth,
        );
        return ListView(
          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
          padding: EdgeInsets.fromLTRB(gutter, 12, gutter, 24),
          children: [
            if (_verified.contains(state.phase)) ...[
              if (secret case final FleetSecretPairing pairing)
                FleetSecretPairDetails(
                  pairing: pairing,
                  fingerprint: state.fingerprint ?? '',
                  now: now,
                )
              else if (state.pin case final pin?)
                FleetSecretRequestDetails(
                  request: request!,
                  pin: pin,
                  requestCode: state.requestCode ?? '',
                  laneTitle: laneTitle,
                  now: now,
                ),
              const SizedBox(height: AppSpacing.md),
            ],
            switch (state.phase) {
              FleetSecretPhase.stepUp => switch (stepUp) {
                final stepUp? => ReplyStepUpPanel(
                  stepUp: stepUp,
                  reason: l10n.mastermindSecretStepUpReason,
                  onVerified: cubit.stepUpVerified,
                ),
                null => FleetSecretStatus(
                  state: state.copyWith(
                    phase: FleetSecretPhase.blocked,
                    block: FleetSecretBlock.signedOut,
                  ),
                  pairing: false,
                ),
              },
              FleetSecretPhase.input when request != null => FleetSecretField(
                onSubmit: (value) => unawaited(cubit.send(value)),
              ),
              FleetSecretPhase.input => _PairCode(state: state),
              FleetSecretPhase.sealing => Column(
                children: [
                  const AppLoadingIndicator(),
                  if (state.retrying) ...[
                    const SizedBox(height: AppSpacing.sm),
                    Text(l10n.mastermindSecretRetrying),
                  ],
                ],
              ),
              _ => FleetSecretStatus(state: state, pairing: request == null),
            },
            if (declinable) ...[
              const SizedBox(height: AppSpacing.md),
              AppButton.outline(
                key: const ValueKey('fleet-secret-decline'),
                onPressed: () => unawaited(cubit.decline()),
                child: Text(l10n.mastermindSecretDecline),
              ),
            ],
            if (forgettable) ...[
              const SizedBox(height: AppSpacing.md),
              AppButton.outline(
                key: const ValueKey('fleet-secret-forget'),
                onPressed: () => unawaited(cubit.forgetMachine()),
                child: Text(l10n.mastermindSecretForget),
              ),
            ],
            if (state.phase == FleetSecretPhase.outcome ||
                state.phase == FleetSecretPhase.closed) ...[
              const SizedBox(height: AppSpacing.md),
              AppButton.outline(
                key: const ValueKey('fleet-secret-done'),
                onPressed: () => Navigator.of(context).maybePop(),
                child: Text(l10n.mastermindSecretClose),
              ),
            ],
          ],
        );
      },
    );
  }
}

/// The 16-character code read off the machine, never through Mastermind.
class _PairCode extends StatefulWidget {
  const _PairCode({required this.state});

  final FleetSecretState state;

  @override
  State<_PairCode> createState() => _PairCodeState();
}

class _PairCodeState extends State<_PairCode> {
  final _code = TextEditingController();

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  void _submit() {
    final code = _code.text;
    _code.clear();
    unawaited(context.read<FleetSecretCubit>().submitCode(code));
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final state = widget.state;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AppTextField(
          key: const ValueKey('fleet-secret-pair-code'),
          controller: _code,
          label: l10n.mastermindSecretCodeLabel,
          placeholder: l10n.mastermindSecretCodePlaceholder,
          autofocus: true,
          autocorrect: false,
          enableSuggestions: false,
          textCapitalization: TextCapitalization.characters,
          keyboardType: TextInputType.visiblePassword,
          inputFormatters: [
            FilteringTextInputFormatter.allow(RegExp('[0-9A-Za-z -]')),
            LengthLimitingTextInputFormatter(24),
          ],
          errorText: switch (state.codeError) {
            FleetSecretCodeError.malformed =>
              l10n.mastermindSecretCodeMalformed,
            FleetSecretCodeError.wrong => l10n.mastermindSecretCodeWrong(
              state.codesLeft ?? 0,
            ),
            null => null,
          },
          onSubmitted: (_) => _submit(),
        ),
        const SizedBox(height: AppSpacing.md),
        AppButton.primary(
          key: const ValueKey('fleet-secret-pair-submit'),
          leading: const Icon(LucideIcons.link, size: 16),
          onPressed: _submit,
          child: Text(l10n.mastermindSecretPairAction),
        ),
      ],
    );
  }
}
