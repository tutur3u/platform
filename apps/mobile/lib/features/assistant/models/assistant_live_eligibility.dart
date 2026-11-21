import 'package:equatable/equatable.dart';
import 'package:flutter/foundation.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/platform/apple_store_policy.dart';
import 'package:mobile/data/sources/api_exception.dart';
import 'package:mobile/l10n/gen/app_localizations.dart';

/// Why the server refuses to start Live. Mirrors the server's stable codes;
/// copy is chosen here and server text is never shown.
enum AssistantLiveBlockReason {
  planRequired('plan_required'),
  creditsExhausted('credits_exhausted'),
  limitReached('limit_reached'),
  roleNotAllowed('role_not_allowed'),
  paused('paused');

  const AssistantLiveBlockReason(this.code);
  final String code;

  static AssistantLiveBlockReason? fromCode(Object? code) {
    for (final reason in values) {
      if (reason.code == code) return reason;
    }
    return null;
  }
}

/// The server decision for starting Live, billed to [billingName].
class AssistantLiveEligibility extends Equatable {
  const AssistantLiveEligibility({
    required this.eligible,
    this.reason,
    this.tier,
    this.billingName,
    this.billingPersonal = false,
    this.plans = const ['PLUS', 'PRO', 'ENTERPRISE'],
    this.balance,
    this.minimumCredits,
    this.resetAt,
  });

  factory AssistantLiveEligibility.fromJson(Map<String, dynamic> json) {
    final billing = json['billing'];
    final params = json['params'];
    final paramMap = params is Map<String, dynamic>
        ? params
        : const <String, dynamic>{};
    final reason = AssistantLiveBlockReason.fromCode(json['reason']);
    final plans = paramMap['plans'];
    return AssistantLiveEligibility(
      // A refusal with an unknown reason still refuses.
      eligible: json['eligible'] == true && reason == null,
      reason: json['eligible'] == true
          ? null
          : reason ?? AssistantLiveBlockReason.paused,
      tier: json['tier'] is String ? json['tier'] as String : null,
      billingName: billing is Map<String, dynamic> && billing['name'] is String
          ? billing['name'] as String
          : null,
      billingPersonal:
          billing is Map<String, dynamic> && billing['personal'] == true,
      plans: plans is List
          ? plans.whereType<String>().toList(growable: false)
          : const ['PLUS', 'PRO', 'ENTERPRISE'],
      balance: (paramMap['balance'] as num?)?.toInt(),
      minimumCredits: (paramMap['minimumCredits'] as num?)?.toInt(),
      resetAt: paramMap['resetAt'] is String
          ? DateTime.tryParse(paramMap['resetAt'] as String)
          : null,
    );
  }

  /// A token-route refusal that raced a stale pre-check. Only the status,
  /// code and Retry-After are known, so the billed workspace is omitted.
  static AssistantLiveEligibility? fromTokenFailure(
    ApiException error, {
    DateTime? now,
  }) {
    final code = error.code ?? '';
    final reason = switch ((error.statusCode, code)) {
      (429, 'FREE_LIVE_DAILY_BUDGET_EXHAUSTED' || 'LIVE_MINT_ACTOR_LIMIT') =>
        AssistantLiveBlockReason.limitReached,
      (402, _) => AssistantLiveBlockReason.creditsExhausted,
      (403, 'LIVE_BLOCKED' || 'LIVE_MODEL_NOT_ALLOWED') =>
        AssistantLiveBlockReason.planRequired,
      (503, 'LIVE_BLOCKED' || 'LIVE_MINT_DISABLED') =>
        AssistantLiveBlockReason.paused,
      _ => null,
    };
    if (reason == null) return null;
    final retryAfter = error.retryAfter;
    return AssistantLiveEligibility(
      eligible: false,
      reason: reason,
      resetAt: retryAfter == null
          ? null
          : (now ?? DateTime.now()).add(Duration(seconds: retryAfter)),
    );
  }

  final bool eligible;
  final AssistantLiveBlockReason? reason;
  final String? tier;
  final String? billingName;
  final bool billingPersonal;
  final List<String> plans;
  final int? balance;
  final int? minimumCredits;
  final DateTime? resetAt;

  bool get blocked => !eligible && reason != null;

  @override
  List<Object?> get props => [
    eligible,
    reason,
    tier,
    billingName,
    billingPersonal,
    plans,
    balance,
    minimumCredits,
    resetAt,
  ];
}

/// Copy for one refusal: a short entry-point line, a sheet title and body.
extension AssistantLiveBlockCopy on AssistantLiveEligibility {
  /// Apple store builds sell nothing, so [platform] (default: the running
  /// one) selects copy that reports access without steering to a purchase.
  String shortReason(AppLocalizations l10n, {TargetPlatform? platform}) =>
      switch (reason) {
        AssistantLiveBlockReason.planRequired =>
          isAppleStorePlatform(platform)
              ? l10n.assistantLiveBlockedIosPlanShort
              : l10n.assistantLiveBlockedPlanShort,
        AssistantLiveBlockReason.creditsExhausted =>
          l10n.assistantLiveBlockedCreditsShort,
        AssistantLiveBlockReason.limitReached =>
          l10n.assistantLiveBlockedLimitShort,
        AssistantLiveBlockReason.roleNotAllowed =>
          l10n.assistantLiveBlockedRoleShort,
        AssistantLiveBlockReason.paused ||
        null => l10n.assistantLiveBlockedPausedShort,
      };

  String title(AppLocalizations l10n, {TargetPlatform? platform}) =>
      switch (reason) {
        AssistantLiveBlockReason.planRequired =>
          isAppleStorePlatform(platform)
              ? l10n.assistantLiveBlockedIosPlanTitle
              : l10n.assistantLiveBlockedPlanTitle,
        AssistantLiveBlockReason.creditsExhausted =>
          isAppleStorePlatform(platform)
              ? l10n.assistantLiveBlockedIosCreditsTitle
              : l10n.assistantLiveBlockedCreditsTitle,
        AssistantLiveBlockReason.limitReached =>
          l10n.assistantLiveBlockedLimitTitle,
        AssistantLiveBlockReason.roleNotAllowed =>
          l10n.assistantLiveBlockedRoleTitle,
        AssistantLiveBlockReason.paused ||
        null => l10n.assistantLiveBlockedPausedTitle,
      };

  String body(
    AppLocalizations l10n, {
    DateTime? now,
    TargetPlatform? platform,
  }) {
    switch (reason) {
      case AssistantLiveBlockReason.planRequired:
        if (isAppleStorePlatform(platform)) {
          return l10n.assistantLiveBlockedIosPlanBody;
        }
        return l10n.assistantLiveBlockedPlanBody(
          plans.map(_planName).join(', '),
        );
      case AssistantLiveBlockReason.creditsExhausted:
        final format = NumberFormat.decimalPattern(l10n.localeName);
        return l10n.assistantLiveBlockedCreditsBody(
          format.format(balance ?? 0),
          format.format(minimumCredits ?? 500),
        );
      case AssistantLiveBlockReason.limitReached:
        final reset = resetAt?.toLocal();
        if (reset == null) return l10n.assistantLiveBlockedLimitBodyLater;
        final today = (now ?? DateTime.now()).toLocal();
        final sameDay =
            reset.year == today.year &&
            reset.month == today.month &&
            reset.day == today.day;
        final time = DateFormat.jm(l10n.localeName).format(reset);
        return sameDay
            ? l10n.assistantLiveBlockedLimitBodyToday(time)
            : l10n.assistantLiveBlockedLimitBodyOn(
                DateFormat.MMMd(l10n.localeName).format(reset),
                time,
              );
      case AssistantLiveBlockReason.roleNotAllowed:
        return l10n.assistantLiveBlockedRoleBody;
      case AssistantLiveBlockReason.paused:
      case null:
        return l10n.assistantLiveBlockedPausedBody;
    }
  }

  /// "Billed to" line, or null when the billed workspace is unknown.
  String? billedTo(AppLocalizations l10n) {
    final name = billingName?.trim();
    if (name != null && name.isNotEmpty) {
      return l10n.assistantLiveBlockedBilledTo(name);
    }
    if (billingPersonal) {
      return l10n.assistantLiveBlockedBilledTo(
        l10n.assistantLiveBlockedPersonalWorkspace,
      );
    }
    return null;
  }
}

String _planName(String tier) => switch (tier.toUpperCase()) {
  'PLUS' => 'Plus',
  'PRO' => 'Pro',
  'ENTERPRISE' => 'Enterprise',
  _ => tier,
};
