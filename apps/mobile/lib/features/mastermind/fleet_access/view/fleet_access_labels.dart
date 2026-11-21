import 'package:flutter/widgets.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/features/mastermind/fleet_access/data/fleet_access_models.dart';
import 'package:mobile/features/mastermind/fleet_access/data/fleet_access_repository.dart';
import 'package:mobile/features/mastermind/fleet_access/data/fleet_intent_draft.dart';
import 'package:mobile/l10n/l10n.dart';

extension FleetLaneStateLabel on FleetLaneState {
  String label(AppLocalizations l10n) => switch (this) {
    FleetLaneState.planned => l10n.mastermindFleetAccessLanePlanned,
    FleetLaneState.running => l10n.mastermindFleetAccessLaneRunning,
    FleetLaneState.blocked => l10n.mastermindFleetAccessLaneBlocked,
    FleetLaneState.ready => l10n.mastermindFleetAccessLaneReady,
    FleetLaneState.done => l10n.mastermindFleetAccessLaneDone,
    FleetLaneState.paused => l10n.mastermindFleetAccessLanePaused,
  };

  AppTone get tone => switch (this) {
    FleetLaneState.running => AppTone.info,
    FleetLaneState.blocked => AppTone.warning,
    FleetLaneState.ready || FleetLaneState.done => AppTone.success,
    FleetLaneState.planned || FleetLaneState.paused => AppTone.neutral,
  };
}

extension FleetBlockerLabel on FleetBlocker {
  String label(AppLocalizations l10n) => switch (this) {
    FleetBlocker.dependency => l10n.mastermindFleetAccessBlockerDependency,
    FleetBlocker.review => l10n.mastermindFleetAccessBlockerReview,
    FleetBlocker.ci => l10n.mastermindFleetAccessBlockerCi,
    FleetBlocker.approval => l10n.mastermindFleetAccessBlockerApproval,
    FleetBlocker.releaseHold => l10n.mastermindFleetAccessBlockerReleaseHold,
    FleetBlocker.capacity => l10n.mastermindFleetAccessBlockerCapacity,
    FleetBlocker.incident => l10n.mastermindFleetAccessBlockerIncident,
  };
}

extension FleetIntentKindLabel on FleetIntentKind {
  String label(AppLocalizations l10n) => switch (this) {
    FleetIntentKind.statusQuestion =>
      l10n.mastermindFleetAccessKindStatusQuestion,
    FleetIntentKind.comment => l10n.mastermindFleetAccessKindComment,
    FleetIntentKind.prioritySet => l10n.mastermindFleetAccessKindPrioritySet,
    FleetIntentKind.approveItem => l10n.mastermindFleetAccessKindApproveItem,
    FleetIntentKind.workCreate => l10n.mastermindFleetAccessKindWorkCreate,
    FleetIntentKind.workRedirect => l10n.mastermindFleetAccessKindWorkRedirect,
    FleetIntentKind.lanePause => l10n.mastermindFleetAccessKindLanePause,
    FleetIntentKind.approveDeploy =>
      l10n.mastermindFleetAccessKindApproveDeploy,
    FleetIntentKind.approveProductionChange =>
      l10n.mastermindFleetAccessKindApproveProductionChange,
  };
}

extension FleetIntentStateLabel on FleetIntentState {
  String label(AppLocalizations l10n) => switch (this) {
    FleetIntentState.pendingApproval =>
      l10n.mastermindFleetAccessStatePendingApproval,
    FleetIntentState.approved => l10n.mastermindFleetAccessStateApproved,
    FleetIntentState.rejected => l10n.mastermindFleetAccessStateRejected,
    FleetIntentState.claimed => l10n.mastermindFleetAccessStateClaimed,
    FleetIntentState.dispatched => l10n.mastermindFleetAccessStateDispatched,
    FleetIntentState.done => l10n.mastermindFleetAccessStateDone,
    FleetIntentState.failed => l10n.mastermindFleetAccessStateFailed,
    FleetIntentState.expired => l10n.mastermindFleetAccessStateExpired,
    FleetIntentState.cancelled => l10n.mastermindFleetAccessStateCancelled,
  };

  AppTone get tone => switch (this) {
    FleetIntentState.pendingApproval => AppTone.warning,
    FleetIntentState.approved ||
    FleetIntentState.claimed ||
    FleetIntentState.dispatched => AppTone.info,
    FleetIntentState.done => AppTone.success,
    FleetIntentState.rejected || FleetIntentState.failed => AppTone.destructive,
    FleetIntentState.expired || FleetIntentState.cancelled => AppTone.neutral,
  };
}

extension FleetChannelLabel on FleetChannel {
  /// Product names; the same in every language.
  String get label => switch (this) {
    FleetChannel.whatsapp => 'WhatsApp',
    FleetChannel.zalo => 'Zalo',
    FleetChannel.discord => 'Discord',
  };
}

extension FleetAccessFailureLabel on FleetAccessFailure {
  String label(AppLocalizations l10n) => switch (this) {
    FleetAccessFailure.session => l10n.mastermindFleetAccessFailureSession,
    FleetAccessFailure.forbidden => l10n.mastermindFleetAccessFailureForbidden,
    FleetAccessFailure.invalidConfirmation =>
      l10n.mastermindFleetAccessFailureInvalidConfirmation,
    FleetAccessFailure.alreadyLinked =>
      l10n.mastermindFleetAccessFailureAlreadyLinked,
    FleetAccessFailure.staleMapping => l10n.mastermindFleetAccessFailureStale,
    FleetAccessFailure.quota => l10n.mastermindFleetAccessFailureQuota,
    FleetAccessFailure.invalid => l10n.mastermindFleetAccessFailureInvalid,
    FleetAccessFailure.unavailable =>
      l10n.mastermindFleetAccessFailureUnavailable,
    FleetAccessFailure.unreadable =>
      l10n.mastermindFleetAccessFailureUnreadable,
  };

  IconData get icon => switch (this) {
    FleetAccessFailure.session ||
    FleetAccessFailure.forbidden => LucideIcons.shieldOff,
    FleetAccessFailure.unavailable => LucideIcons.cloudOff,
    _ => LucideIcons.triangleAlert,
  };
}

extension FleetDraftChoiceLabels on AppLocalizations {
  String topic(FleetTopic value) => switch (value) {
    FleetTopic.status => mastermindFleetAccessTopicStatus,
    FleetTopic.readiness => mastermindFleetAccessTopicReadiness,
    FleetTopic.timeline => mastermindFleetAccessTopicTimeline,
  };

  String priority(FleetPriority value) => switch (value) {
    FleetPriority.low => mastermindFleetAccessPriorityLow,
    FleetPriority.normal => mastermindFleetAccessPriorityNormal,
    FleetPriority.high => mastermindFleetAccessPriorityHigh,
    FleetPriority.urgent => mastermindFleetAccessPriorityUrgent,
  };

  String template(FleetWorkTemplate value) => switch (value) {
    FleetWorkTemplate.investigation =>
      mastermindFleetAccessTemplateInvestigation,
    FleetWorkTemplate.maintenance => mastermindFleetAccessTemplateMaintenance,
    FleetWorkTemplate.regressionFix =>
      mastermindFleetAccessTemplateRegressionFix,
  };

  String objective(FleetObjective value) => switch (value) {
    FleetObjective.investigate => mastermindFleetAccessObjectiveInvestigate,
    FleetObjective.verify => mastermindFleetAccessObjectiveVerify,
    FleetObjective.prepareReview => mastermindFleetAccessObjectivePrepareReview,
  };

  String environment(FleetEnvironment value) => switch (value) {
    FleetEnvironment.staging => mastermindFleetAccessEnvironmentStaging,
    FleetEnvironment.production => mastermindFleetAccessEnvironmentProduction,
  };
}
