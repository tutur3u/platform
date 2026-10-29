import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/components/app_button.dart';
import 'package:mobile/core/ui/components/app_loading_indicator.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';
import 'package:mobile/features/mastermind/catchup/catchup_group.dart';
import 'package:mobile/features/mastermind/catchup/catchup_models.dart';
import 'package:mobile/features/mastermind/catchup/catchup_navigation.dart';
import 'package:mobile/features/mastermind/catchup/catchup_refresh.dart';
import 'package:mobile/features/mastermind/catchup/catchup_rel_time.dart';
import 'package:mobile/features/mastermind/catchup/catchup_session.dart';
import 'package:mobile/features/mastermind/catchup/catchup_view_model.dart';
import 'package:mobile/features/mastermind/catchup/catchup_visit.dart';
import 'package:mobile/features/mastermind/presentation/age_text.dart';
import 'package:mobile/features/mastermind/presentation/freshness.dart';
import 'package:mobile/features/mastermind/presentation/snapshot_age.dart';
import 'package:mobile/l10n/l10n.dart';

/// "Since you last looked": the digest at the top of Today.
///
/// Filters the hub's items to the visit window on the client, groups them per
/// product and keeps the time labels live with one 30 second ticker.
class CatchupSection extends StatefulWidget {
  const CatchupSection({
    required this.digest,
    required this.freshness,
    required this.refresh,
    required this.onCatchMeUp,
    required this.clock,
    this.session,
    this.launchLink = launchInSystemBrowser,
    super.key,
  });

  final CatchupDigest digest;
  final MastermindFreshness freshness;
  final CatchupRefreshController refresh;

  /// Refetches the snapshot; wired to the same call as pull-to-refresh.
  final VoidCallback onCatchMeUp;
  final Clock clock;
  final CatchupSession? session;
  final CatchupLinkLauncher launchLink;

  @override
  State<CatchupSection> createState() => _CatchupSectionState();
}

class _CatchupSectionState extends State<CatchupSection> {
  late final CatchupSession _session = widget.session ?? CatchupSession.shared;
  Timer? _ticker;
  late DateTime _now = widget.clock();
  CatchupWindow? _window;

  @override
  void initState() {
    super.initState();
    if (_session.tracker.isLoaded) _window = _session.tracker.windowAt(_now);
    unawaited(
      _session.tracker.load().then((_) {
        if (mounted) _tick();
      }),
    );
    _ticker = Timer.periodic(const Duration(seconds: 30), (_) => _tick());
  }

  void _tick() => setState(() {
    _now = widget.clock();
    if (_session.tracker.isLoaded) _window = _session.tracker.windowAt(_now);
  });

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  void _open(CatchupItem item) =>
      openCatchupItem(context, item, launch: widget.launchLink);

  @override
  Widget build(BuildContext context) {
    final window = _window;
    // The marker is read from disk first; nothing to show for that instant.
    if (window == null) return const SizedBox.shrink();
    final model = CatchupViewModel.build(
      digest: widget.digest,
      window: window,
      now: _now,
      showEarlier: _session.showEarlier,
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AppGroupedSection.spaced(
          caption: context.l10n.mastermindCatchupTitle,
          children: [
            _CatchupHeader(
              model: model,
              window: window,
              digest: widget.digest,
              freshness: widget.freshness,
              refresh: widget.refresh,
              now: _now,
              onCatchMeUp: widget.onCatchMeUp,
            ),
          ],
        ),
        for (final section in model.sections)
          CatchupSectionCard(
            section: section,
            digest: widget.digest,
            now: _now,
            isCollapsed: _session.isCollapsed,
            onToggle: (key, {required collapsed}) => setState(
              () => _session.setCollapsed(key, collapsed: collapsed),
            ),
            onOpen: _open,
          ),
        if (model.earlierCount > 0)
          Padding(
            padding: const EdgeInsets.only(bottom: AppLayout.sectionGap),
            child: AppButton.ghost(
              onPressed: () => setState(() => _session.showEarlier = true),
              child: Text(
                context.l10n.mastermindCatchupShowEarlier(model.earlierCount),
              ),
            ),
          ),
      ],
    );
  }
}

class _CatchupHeader extends StatelessWidget {
  const _CatchupHeader({
    required this.model,
    required this.window,
    required this.digest,
    required this.freshness,
    required this.refresh,
    required this.now,
    required this.onCatchMeUp,
  });

  final CatchupViewModel model;
  final CatchupWindow window;
  final CatchupDigest digest;
  final MastermindFreshness freshness;
  final CatchupRefreshController refresh;
  final DateTime now;
  final VoidCallback onCatchMeUp;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    final colors = tokens.colorScheme;
    final muted = tokens.typography.small.copyWith(
      color: colors.mutedForeground,
    );
    final since = window.newSince;
    final counts = _countsLine(l10n, model.counts);
    final offline =
        freshness.kind == MastermindFreshnessKind.offline ||
        freshness.kind == MastermindFreshnessKind.couldntRefresh;
    final shownAt = digest.generatedAt ?? freshness.time;
    return Padding(
      padding: const EdgeInsets.all(AppLayout.rowHorizontalPadding),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Wrap(
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              Text(
                since == null
                    ? l10n.mastermindCatchupWindowDay
                    : l10n.mastermindCatchupWindowSince,
                style: muted,
              ),
              if (since != null) CatchupRelTime(at: since, now: now),
            ],
          ),
          if (window.firstVisit) ...[
            const SizedBox(height: AppSpacing.xs),
            Text(l10n.mastermindCatchupWelcome, style: tokens.typography.base),
          ],
          if (counts != null) ...[
            const SizedBox(height: AppSpacing.xs),
            Text(
              counts,
              key: const ValueKey('catchup-counts'),
              style: tokens.typography.base.copyWith(
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
          if (model.isEmpty) ...[
            const SizedBox(height: AppSpacing.xs),
            Wrap(
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                Text(
                  window.firstVisit
                      ? l10n.mastermindCatchupQuietFirstRun
                      : l10n.mastermindCatchupQuiet,
                  key: const ValueKey('catchup-quiet'),
                ),
                if (since != null) CatchupRelTime(at: since, now: now),
              ],
            ),
          ],
          if (model.partial) ...[
            const SizedBox(height: AppSpacing.xs),
            _Note(
              icon: AppIcons.warning,
              text: l10n.mastermindCatchupPartial,
              key: const ValueKey('catchup-partial'),
            ),
          ],
          if (offline) ...[
            const SizedBox(height: AppSpacing.xs),
            _Note(
              icon: LucideIcons.cloudOff,
              text: freshness.kind == MastermindFreshnessKind.offline
                  ? l10n.mastermindOfflineShowing(
                      mastermindAgeText(l10n, now.difference(shownAt)),
                    )
                  : l10n.mastermindCouldntRefreshShowing(
                      mastermindAgeText(l10n, now.difference(shownAt)),
                    ),
              key: const ValueKey('catchup-offline'),
            ),
          ],
          const SizedBox(height: AppSpacing.sm),
          ListenableBuilder(
            listenable: refresh,
            builder: (context, _) =>
                _CatchMeUp(status: refresh.status, onPressed: onCatchMeUp),
          ),
        ],
      ),
    );
  }
}

String? _countsLine(AppLocalizations l10n, CatchupCounts counts) {
  final parts = [
    if (counts.needsYou > 0)
      l10n.mastermindCatchupCountNeedsYou(counts.needsYou),
    if (counts.shipped > 0) l10n.mastermindCatchupCountShipped(counts.shipped),
    if (counts.blocked > 0) l10n.mastermindCatchupCountBlocked(counts.blocked),
    if (counts.changed > 0) l10n.mastermindCatchupCountChanged(counts.changed),
  ];
  return parts.isEmpty ? null : parts.join(' · ');
}

class _Note extends StatelessWidget {
  const _Note({required this.icon, required this.text, super.key});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    return Semantics(
      liveRegion: true,
      container: true,
      child: Row(
        children: [
          Icon(
            icon,
            size: 14,
            color: AppTone.warning.foreground(tokens.colorScheme),
          ),
          const SizedBox(width: AppSpacing.xs),
          Expanded(child: Text(text, style: tokens.typography.small)),
        ],
      ),
    );
  }
}

class _CatchMeUp extends StatelessWidget {
  const _CatchMeUp({required this.status, required this.onPressed});

  final CatchupRefreshStatus status;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final busy = status == CatchupRefreshStatus.refreshing;
    final message = switch (status) {
      CatchupRefreshStatus.refreshing => l10n.mastermindCatchupRefreshing,
      CatchupRefreshStatus.upToDate => l10n.mastermindCatchupUpToDate,
      CatchupRefreshStatus.failed => l10n.mastermindCatchupFailed,
      CatchupRefreshStatus.idle => null,
    };
    return Wrap(
      crossAxisAlignment: WrapCrossAlignment.center,
      spacing: AppSpacing.sm,
      runSpacing: AppSpacing.xs,
      children: [
        AppButton.secondary(
          key: const ValueKey('catchup-button'),
          onPressed: busy ? null : onPressed,
          leading: busy
              ? const AppLoadingIndicator.inline()
              : const Icon(LucideIcons.refreshCw, size: 16),
          child: Text(l10n.mastermindCatchupButton),
        ),
        if (message != null)
          Semantics(
            liveRegion: true,
            child: Text(
              message,
              key: const ValueKey('catchup-status'),
              style: AppTokens.of(context).typography.small.copyWith(
                color: status == CatchupRefreshStatus.failed
                    ? AppTone.destructive.foreground(
                        AppTokens.of(context).colorScheme,
                      )
                    : AppTokens.of(context).colorScheme.mutedForeground,
              ),
            ),
          ),
      ],
    );
  }
}
