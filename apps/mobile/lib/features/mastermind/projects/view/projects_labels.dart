import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/features/mastermind/fleet/cubit/fleet_thread_reply_cubit.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_thread_models.dart';
import 'package:mobile/features/mastermind/projects/data/projects_models.dart';
import 'package:mobile/features/mastermind/projects/data/projects_repository.dart';
import 'package:mobile/l10n/l10n.dart';

extension ProjectThreadStateView on ProjectThreadState {
  AppTone get tone => switch (this) {
    ProjectThreadState.running => AppTone.success,
    ProjectThreadState.waiting => AppTone.warning,
    ProjectThreadState.failed => AppTone.destructive,
    ProjectThreadState.idle => AppTone.neutral,
  };

  /// What the agent is doing, from the row state alone.
  String describe(AppLocalizations l10n) => switch (this) {
    ProjectThreadState.running => l10n.mastermindProjectsStateRunning,
    ProjectThreadState.waiting => l10n.mastermindProjectsStateWaiting,
    ProjectThreadState.failed => l10n.mastermindProjectsStateFailed,
    ProjectThreadState.idle => l10n.mastermindProjectsStateIdle,
  };
}

extension ProjectsMachineView on ProjectsMachine {
  /// The bridge machine reads as "This machine" in the app's language.
  String display(AppLocalizations l10n) =>
      linked ? label : l10n.mastermindProjectsThisMachine;
}

extension ProjectsFailureView on ProjectsFailureKind {
  String message(AppLocalizations l10n) => switch (this) {
    ProjectsFailureKind.machineOffline => l10n.mastermindProjectsErrorOffline,
    ProjectsFailureKind.timeout => l10n.mastermindProjectsErrorTimeout,
    ProjectsFailureKind.notFound => l10n.mastermindProjectsErrorNotFound,
    ProjectsFailureKind.mfaRequired => l10n.mastermindProjectsErrorMfa,
    ProjectsFailureKind.forbidden => l10n.mastermindForbiddenTitle,
    ProjectsFailureKind.rateLimited => l10n.mastermindProjectsErrorRateLimited,
    ProjectsFailureKind.unsupportedForLinkedMachine =>
      l10n.mastermindProjectsErrorUnsupported,
    ProjectsFailureKind.invalid => l10n.mastermindProjectsErrorInvalid,
    ProjectsFailureKind.unavailable => l10n.mastermindProjectsErrorUnavailable,
  };
}

/// What the receipt line under a posted reply says.
enum ReplyPhase { sending, sent, steered, started, queued, delivered, failed }

/// The receipt line for [status]; null while nothing is being sent and
/// while it waits for an MFA check.
ReplyPhase? replyPhaseOf(FleetReplyStatus status) => switch (status.phase) {
  FleetReplyPhase.idle => null,
  FleetReplyPhase.sending => ReplyPhase.sending,
  FleetReplyPhase.sent => ReplyPhase.sent,
  FleetReplyPhase.delivered => switch (status.reply?.delivery) {
    FleetReplyDelivery.steered => ReplyPhase.steered,
    FleetReplyDelivery.started => ReplyPhase.started,
    FleetReplyDelivery.queued => ReplyPhase.queued,
    null => ReplyPhase.delivered,
  },
  // Not a delivery state: the bubble shows the MFA message and its action.
  FleetReplyPhase.needsMfa => null,
  FleetReplyPhase.failed => ReplyPhase.failed,
};

extension ReplyPhaseView on ReplyPhase {
  String label(AppLocalizations l10n) => switch (this) {
    ReplyPhase.sending => l10n.mastermindProjectsReceiptSending,
    ReplyPhase.sent => l10n.mastermindProjectsReceiptSent,
    ReplyPhase.steered => l10n.mastermindProjectsReceiptSteered,
    ReplyPhase.started => l10n.mastermindProjectsReceiptStarted,
    ReplyPhase.queued => l10n.mastermindProjectsReceiptQueued,
    ReplyPhase.delivered => l10n.mastermindProjectsReceiptDelivered,
    ReplyPhase.failed => l10n.mastermindProjectsReceiptNotDelivered,
  };

  AppTone get tone => switch (this) {
    ReplyPhase.sending => AppTone.neutral,
    ReplyPhase.sent => AppTone.info,
    ReplyPhase.failed => AppTone.destructive,
    _ => AppTone.success,
  };

  /// Steps of the two-segment track that are done.
  int get steps => switch (this) {
    ReplyPhase.sending => 0,
    ReplyPhase.sent || ReplyPhase.failed => 1,
    _ => 2,
  };
}
