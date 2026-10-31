import 'package:mobile/features/mastermind/model/enums.dart';
import 'package:mobile/features/mastermind/presentation/hub_field.dart';
import 'package:mobile/l10n/gen/app_localizations.dart';

abstract final class MastermindLabels {
  static String eventKind(AppLocalizations l10n, EventKind value) =>
      switch (value) {
        EventKind.needsYou => l10n.mastermindEventNeedsYou,
        EventKind.decision => l10n.mastermindEventDecision,
        EventKind.lane => l10n.mastermindEventLane,
        EventKind.backlog => l10n.mastermindEventBacklog,
        EventKind.product => l10n.mastermindEventProduct,
        EventKind.quota => l10n.mastermindEventQuota,
        EventKind.environment => l10n.mastermindEventEnvironment,
        EventKind.receipt => l10n.mastermindEventReceipt,
      };
  static String releaseProduct(ReleaseProduct value) => value.wireName;
  static String ageBasis(AppLocalizations l10n, AgeBasis value) =>
      switch (value) {
        AgeBasis.githubDeployment => l10n.mastermindBasisGithubDeployment,
        AgeBasis.vercelDeployment => l10n.mastermindBasisVercelDeployment,
        AgeBasis.checkinWorkflow => l10n.mastermindBasisCheckinWorkflow,
        AgeBasis.unknown => HubField.text(l10n, null),
      };
  static String environment(AppLocalizations l10n, Environment value) =>
      switch (value) {
        Environment.production => l10n.mastermindEnvProduction,
        Environment.staging => l10n.mastermindEnvStaging,
      };
  static String deployStatus(AppLocalizations l10n, DeployStatus value) =>
      switch (value) {
        DeployStatus.success => l10n.mastermindDeploySuccess,
        DeployStatus.failure => l10n.mastermindDeployFailure,
        DeployStatus.error => l10n.mastermindDeployError,
        DeployStatus.pending => l10n.mastermindDeployPending,
        DeployStatus.queued => l10n.mastermindDeployQueued,
        DeployStatus.inProgress => l10n.mastermindDeployInProgress,
        DeployStatus.inactive => l10n.mastermindDeployInactive,
        DeployStatus.unknown => HubField.text(l10n, null),
      };
  static String ciState(AppLocalizations l10n, CiState value) =>
      switch (value) {
        CiState.success => l10n.mastermindDeploySuccess,
        CiState.failure => l10n.mastermindDeployFailure,
        CiState.pending => l10n.mastermindDeployPending,
        CiState.error => l10n.mastermindDeployError,
        CiState.unknown => HubField.text(l10n, null),
      };
  static String freshness(AppLocalizations l10n, Freshness value) =>
      switch (value) {
        Freshness.fresh => l10n.mastermindFreshFresh,
        Freshness.cached => l10n.mastermindFreshCached,
        Freshness.stale => l10n.mastermindCoverageStale,
        Freshness.unknown => HubField.text(l10n, null),
      };
  static String evidence(AppLocalizations l10n, Evidence value) =>
      switch (value) {
        Evidence.githubDeployment => l10n.mastermindBasisGithubDeployment,
        Evidence.vercelDeployment => l10n.mastermindBasisVercelDeployment,
        Evidence.unknown => HubField.text(l10n, null),
      };
  static String laneState(AppLocalizations l10n, LaneState value) =>
      switch (value) {
        LaneState.open => l10n.mastermindStateOpen,
        LaneState.answered => l10n.mastermindStateAnswered,
        LaneState.withdrawn => l10n.mastermindStateWithdrawn,
        LaneState.stale => l10n.mastermindStateStale,
        LaneState.queued => l10n.mastermindStateQueued,
        LaneState.running => l10n.mastermindStateRunning,
        LaneState.waiting => l10n.mastermindStateWaiting,
        LaneState.idle => l10n.mastermindStateIdle,
        LaneState.completed => l10n.mastermindStateCompleted,
        LaneState.failed => l10n.mastermindStateFailed,
        LaneState.cancelled => l10n.mastermindStateCancelled,
        LaneState.unknown => HubField.text(l10n, null),
      };
  static String repositoryName(RepositoryName value) => value.wireName;
  static String coverage(AppLocalizations l10n, Coverage value) =>
      switch (value) {
        Coverage.ok => l10n.mastermindCoverageComplete,
        Coverage.missing => l10n.mastermindCoverageMissing,
        Coverage.partial => l10n.mastermindCoveragePartial,
        Coverage.unavailable => l10n.mastermindUnavailable,
        Coverage.stale => l10n.mastermindCoverageStale,
      };
  static String pacing(Pacing value) => value.wireName;
  static String modelFamily(ModelFamily value) => value.wireName;
  static String runRole(RunRole value) => value.wireName;
  static String effort(Effort value) => value.wireName;
  static String role(Role value) => value.wireName;
  static String product(Product value) => value.wireName;
  static String failureCause(AppLocalizations l10n, FailureCause value) =>
      switch (value) {
        FailureCause.usageLimit => l10n.mastermindSeriesUsageLimit,
        FailureCause.capacity => l10n.mastermindSeriesCapacity,
        FailureCause.error => l10n.mastermindSeriesOtherError,
      };
  static String sourceName(AppLocalizations l10n, SourceName value) =>
      switch (value) {
        SourceName.inbox => l10n.mastermindSourceInbox,
        SourceName.openItems => l10n.mastermindSourceOpenItems,
        SourceName.directory => l10n.mastermindSourceDirectory,
        SourceName.t3 => l10n.mastermindSourceT3,
        SourceName.ledger => l10n.mastermindSourceLedger,
        SourceName.checkin => l10n.mastermindSourceCheckin,
        SourceName.github => l10n.mastermindSourceGithub,
        SourceName.quotaCache => l10n.mastermindSourceQuotaCache,
        SourceName.quotaWatcher => l10n.mastermindSourceQuotaWatcher,
        SourceName.decisions => l10n.mastermindSourceDecisions,
        SourceName.speed => l10n.mastermindSourceSpeed,
        SourceName.workforce => l10n.mastermindSourceWorkforce,
        SourceName.ci => l10n.mastermindSourceCi,
      };
  static String sourceState(AppLocalizations l10n, SourceState value) =>
      switch (value) {
        SourceState.ok => l10n.mastermindSourceStateOk,
        SourceState.missing => l10n.mastermindCoverageMissing,
        SourceState.unavailable => l10n.mastermindUnavailable,
        SourceState.stale => l10n.mastermindCoverageStale,
      };
  static String itemState(AppLocalizations l10n, ItemState value) =>
      switch (value) {
        ItemState.open => l10n.mastermindStateOpen,
        ItemState.answered => l10n.mastermindStateAnswered,
        ItemState.withdrawn => l10n.mastermindStateWithdrawn,
      };
  static String itemKind(AppLocalizations l10n, ItemKind value) =>
      switch (value) {
        ItemKind.decision => l10n.mastermindKindDecision,
        ItemKind.action => l10n.mastermindKindAction,
        ItemKind.fyi => l10n.mastermindKindFyi,
      };
  static String area(AppLocalizations l10n, Area value) => switch (value) {
    Area.finance => l10n.mastermindAreaFinance,
    Area.users => l10n.mastermindAreaUsers,
    Area.tasks => l10n.mastermindAreaTasks,
    Area.education => l10n.mastermindAreaEducation,
    Area.infra => l10n.mastermindAreaInfra,
    Area.ux => l10n.mastermindAreaUx,
    Area.perf => l10n.mastermindAreaPerf,
    Area.ci => l10n.mastermindAreaCi,
    Area.release => l10n.mastermindAreaRelease,
    Area.quota => l10n.mastermindAreaQuota,
    Area.memory => l10n.mastermindAreaMemory,
    Area.hub => l10n.mastermindAreaHub,
  };
  static String laneKind(AppLocalizations l10n, LaneKind value) =>
      switch (value) {
        LaneKind.implementation => l10n.mastermindKindImplementation,
        LaneKind.review => l10n.mastermindKindReview,
        LaneKind.test => l10n.mastermindKindTest,
        LaneKind.design => l10n.mastermindKindDesign,
        LaneKind.research => l10n.mastermindKindResearch,
        LaneKind.decision => l10n.mastermindKindDecision,
        LaneKind.lane => l10n.mastermindKindLane,
        LaneKind.backlog => l10n.mastermindKindBacklog,
        LaneKind.action => l10n.mastermindKindAction,
        LaneKind.fyi => l10n.mastermindKindFyi,
        LaneKind.staff => l10n.mastermindKindStaff,
      };
  static String receiptProduct(ReceiptProduct value) => value.wireName;
  static String receiptState(AppLocalizations l10n, ReceiptState value) =>
      switch (value) {
        ReceiptState.completed => l10n.mastermindStateCompleted,
        ReceiptState.failed => l10n.mastermindStateFailed,
        ReceiptState.waiting => l10n.mastermindStateWaiting,
      };
  static String decisionArea(AppLocalizations l10n, DecisionArea value) =>
      switch (value) {
        DecisionArea.finance => l10n.mastermindAreaFinance,
        DecisionArea.users => l10n.mastermindAreaUsers,
        DecisionArea.tasks => l10n.mastermindAreaTasks,
        DecisionArea.education => l10n.mastermindAreaEducation,
        DecisionArea.infra => l10n.mastermindAreaInfra,
        DecisionArea.ux => l10n.mastermindAreaUx,
        DecisionArea.perf => l10n.mastermindAreaPerf,
        DecisionArea.ci => l10n.mastermindAreaCi,
        DecisionArea.release => l10n.mastermindAreaRelease,
        DecisionArea.quota => l10n.mastermindAreaQuota,
        DecisionArea.memory => l10n.mastermindAreaMemory,
        DecisionArea.hub => l10n.mastermindAreaHub,
        DecisionArea.product => l10n.mastermindAreaProduct,
        DecisionArea.org => l10n.mastermindAreaOrg,
        DecisionArea.cost => l10n.mastermindAreaCost,
      };
  static String risk(AppLocalizations l10n, Risk value) => switch (value) {
    Risk.low => l10n.mastermindRiskLow,
    Risk.med => l10n.mastermindRiskMed,
    Risk.high => l10n.mastermindRiskHigh,
  };
  static String decisionCategory(
    AppLocalizations l10n,
    DecisionCategory value,
  ) => switch (value) {
    DecisionCategory.auto => l10n.mastermindCategoryAuto,
    DecisionCategory.delegated => l10n.mastermindCategoryDelegated,
    DecisionCategory.user => l10n.mastermindCategoryUser,
  };
}
