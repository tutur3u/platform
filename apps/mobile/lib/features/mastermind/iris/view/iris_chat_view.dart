import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/components/app_alert.dart';
import 'package:mobile/core/ui/components/app_button.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';
import 'package:mobile/features/mastermind/iris/cubit/iris_feed_cubit.dart';
import 'package:mobile/features/mastermind/iris/cubit/iris_send_cubit.dart';
import 'package:mobile/features/mastermind/iris/data/iris_models.dart';
import 'package:mobile/features/mastermind/iris/data/iris_relay.dart';
import 'package:mobile/features/mastermind/iris/iris_flag.dart';
import 'package:mobile/features/mastermind/iris/view/iris_composer.dart';
import 'package:mobile/features/mastermind/iris/view/iris_message_tile.dart';
import 'package:mobile/features/mastermind/iris/view/iris_outgoing_tile.dart';
import 'package:mobile/l10n/l10n.dart';

/// The Inbox Chat segment: Atlas and role messages newest LAST, this device's
/// sends with their receipts below them, and the composer in the dock.
///
/// The list is reversed so it opens at the newest message and holds its place
/// as new ones arrive. [leading] (the segment bar, "What needs me") sits above
/// the oldest message and scrolls with the history. Polling runs only while
/// the app is in the foreground; history is in memory only and is dropped
/// when the app leaves the foreground.
///
/// The composer is off unless the hub reports `iris: true` ([writesEnabled])
/// and the relay has served this device a signed read: Iris writes stay off
/// until the native write enforcement is signed off.
class IrisChatView extends StatefulWidget {
  const IrisChatView({
    required this.relay,
    this.leading,
    this.feedCubit,
    this.sendCubit,
    this.onEnrol,
    this.writesEnabled,
    super.key,
  });

  final IrisRelay relay;

  /// Opens enrolment; offered when the device is locked out or removed.
  final VoidCallback? onEnrol;

  /// Whether the relay accepts writes; the hub capability when null.
  final ValueListenable<bool>? writesEnabled;

  /// The widgets above the oldest message, given the relay's latest summary.
  final List<Widget> Function(IrisSummary? summary)? leading;

  /// Test seams; created from [relay] when absent.
  final IrisFeedCubit? feedCubit;
  final IrisSendCubit? sendCubit;

  @override
  State<IrisChatView> createState() => _IrisChatViewState();
}

class _IrisChatViewState extends State<IrisChatView>
    with WidgetsBindingObserver {
  late final IrisFeedCubit _feed =
      widget.feedCubit ?? IrisFeedCubit(relay: widget.relay);
  late final IrisSendCubit _send =
      widget.sendCubit ??
      IrisSendCubit(
        relay: widget.relay,
        // A send that meets the kill switch refreshes the feed's banner.
        onFailure: (failure) {
          if (failure.kind == IrisFailureKind.killed) unawaited(_feed.poll());
        },
      );
  late final StreamSubscription<IrisFeedState> _feedSub;

  /// The relay said this device is gone; its enrolment is already cleared,
  /// so later polls fail as `notEnrolled`. Kept until a read succeeds, so
  /// the owner still sees why.
  bool _revoked = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _feedSub = _feed.stream.listen((state) {
      _send.reconcile(state.messages);
      final kind = state.failure?.kind;
      if (kind == IrisFailureKind.deviceRevoked) {
        _revoked = true;
      } else if (kind == null && state.loaded) {
        _revoked = false;
      }
    });
    _feed.start();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    switch (state) {
      case AppLifecycleState.resumed:
        _feed.start();
      case AppLifecycleState.paused || AppLifecycleState.hidden:
        // The app lock takes over in the background; history goes with it.
        _feed.clear();
      case AppLifecycleState.inactive || AppLifecycleState.detached:
        break;
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    unawaited(_feedSub.cancel());
    if (widget.feedCubit == null) unawaited(_feed.close());
    if (widget.sendCubit == null) unawaited(_send.close());
    super.dispose();
  }

  @override
  Widget build(BuildContext context) =>
      BlocBuilder<IrisFeedCubit, IrisFeedState>(
        bloc: _feed,
        builder: (context, feed) =>
            BlocBuilder<IrisSendCubit, List<IrisOutgoing>>(
              bloc: _send,
              builder: (context, outgoing) => ValueListenableBuilder<bool>(
                valueListenable:
                    widget.writesEnabled ?? mastermindIrisCapability,
                builder: (context, writes, _) {
                  final blocked = _writesBlocked(context, feed, writes: writes);
                  return Stack(
                    children: [
                      _list(context, feed, outgoing, blocked),
                      IrisComposer(
                        enabled: !feed.killed && blocked == null,
                        onSend: _send.send,
                      ),
                    ],
                  );
                },
              ),
            ),
      );

  /// Why the composer is off (empty while the first page loads), or null
  /// when the device may write. The kill switch has its own banner.
  String? _writesBlocked(
    BuildContext context,
    IrisFeedState feed, {
    required bool writes,
  }) {
    final l10n = context.l10n;
    if (!feed.loaded) return '';
    if (const {
      IrisFailureKind.notEnrolled,
      IrisFailureKind.deviceRevoked,
      IrisFailureKind.notConfigured,
    }.contains(feed.failure?.kind)) {
      return l10n.mastermindIrisWritesNeedEnrol;
    }
    if (!writes) return l10n.mastermindIrisWritesOff;
    return null;
  }

  Widget _list(
    BuildContext context,
    IrisFeedState feed,
    List<IrisOutgoing> outgoing,
    String? writesBlocked,
  ) {
    final l10n = context.l10n;
    final messages = feed.messages;
    final empty = feed.loaded && messages.isEmpty && outgoing.isEmpty;
    // Reversed: the first sliver sits at the bottom, beside the dock, and
    // the last (the leading header) at the top above the oldest message.
    return CustomScrollView(
      reverse: true,
      physics: const AlwaysScrollableScrollPhysics(),
      slivers: [
        SliverAppPage(
          sliver: SliverMainAxisGroup(
            slivers: [
              if (writesBlocked != null &&
                  writesBlocked.isNotEmpty &&
                  !feed.killed)
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      vertical: AppSpacing.sm,
                    ),
                    child: Text(
                      writesBlocked,
                      key: const ValueKey('iris-writes-off'),
                      textAlign: TextAlign.center,
                      style: AppTokens.of(context).typography.small.copyWith(
                        color: AppTokens.of(
                          context,
                        ).colorScheme.mutedForeground,
                      ),
                    ),
                  ),
                ),
              SliverList.builder(
                itemCount: outgoing.length,
                itemBuilder: (context, index) {
                  final row = outgoing[outgoing.length - 1 - index];
                  return IrisOutgoingTile(
                    row: row,
                    canRetry: !feed.killed,
                    onRetry: () => _send.retry(row.clientId),
                  );
                },
              ),
              SliverList.builder(
                itemCount: messages.length,
                itemBuilder: (context, index) => IrisMessageTile(
                  message: messages[messages.length - 1 - index],
                ),
              ),
              SliverToBoxAdapter(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    ...?widget.leading?.call(feed.summary),
                    ?_banner(context, feed.failure),
                    if (!feed.loaded)
                      const Padding(
                        padding: EdgeInsets.all(AppSpacing.lg),
                        child: Center(child: CircularProgressIndicator()),
                      ),
                    if (empty)
                      Padding(
                        padding: const EdgeInsets.all(AppSpacing.lg),
                        child: Text(
                          l10n.mastermindIrisChatEmpty,
                          textAlign: TextAlign.center,
                          style: AppTokens.of(context).typography.small
                              .copyWith(
                                color: AppTokens.of(
                                  context,
                                ).colorScheme.mutedForeground,
                              ),
                        ),
                      ),
                    if (feed.nextBefore != null)
                      Padding(
                        padding: const EdgeInsets.symmetric(
                          vertical: AppSpacing.sm,
                        ),
                        child: AppButton.ghost(
                          key: const ValueKey('iris-load-earlier'),
                          onPressed: feed.loadingOlder
                              ? null
                              : () => unawaited(_feed.loadOlder()),
                          child: Text(l10n.mastermindIrisLoadEarlier),
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget? _banner(BuildContext context, IrisFailure? failure) {
    final l10n = context.l10n;
    final c = AppTokens.of(context).colorScheme;
    final enrol = widget.onEnrol;
    Widget? enrolAgain() => enrol == null
        ? null
        : AppButton.secondary(
            key: const ValueKey('iris-banner-enrol'),
            size: AppButtonSize.small,
            onPressed: enrol,
            child: Text(l10n.mastermindIrisEnrolAgainAction),
          );
    var kind = failure?.kind;
    if (kind == IrisFailureKind.notEnrolled && _revoked) {
      kind = IrisFailureKind.deviceRevoked;
    }
    return switch (kind) {
      IrisFailureKind.killed => AppAlert(
        key: const ValueKey('iris-killed-banner'),
        variant: AppAlertVariant.warning,
        leading: Icon(LucideIcons.octagonPause, color: c.warning),
        title: Text(l10n.mastermindIrisKilledTitle),
        content: Text(l10n.mastermindIrisKilledBody),
      ),
      IrisFailureKind.offline || IrisFailureKind.unavailable => AppAlert(
        leading: Icon(AppIcons.info, color: c.info),
        content: Text(l10n.mastermindIrisOffline),
      ),
      IrisFailureKind.rateLimited => AppAlert(
        leading: Icon(AppIcons.info, color: c.info),
        content: Text(l10n.mastermindIrisRateLimited),
      ),
      IrisFailureKind.clockSkew => AppAlert(
        key: const ValueKey('iris-clock-skew-banner'),
        variant: AppAlertVariant.warning,
        leading: Icon(AppIcons.info, color: c.warning),
        content: Text(l10n.mastermindIrisClockSkew),
      ),
      IrisFailureKind.deviceRevoked => AppAlert.destructive(
        key: const ValueKey('iris-device-revoked-banner'),
        content: Text(l10n.mastermindIrisDeviceRevoked),
        trailing: enrolAgain(),
      ),
      IrisFailureKind.unauthorized ||
      IrisFailureKind.forbidden ||
      IrisFailureKind.notEnrolled => AppAlert.destructive(
        content: Text(l10n.mastermindIrisAccessLost),
      ),
      // Never a weaker key: the only way out is a new hardware key.
      IrisFailureKind.deviceLocked => AppAlert(
        key: const ValueKey('iris-device-locked-banner'),
        leading: Icon(AppIcons.info, color: c.info),
        content: Text(
          '${l10n.mastermindIrisDeviceLocked} '
          '${l10n.mastermindIrisDeviceLockedEnrol}',
        ),
        trailing: enrolAgain(),
      ),
      _ => null,
    };
  }
}
