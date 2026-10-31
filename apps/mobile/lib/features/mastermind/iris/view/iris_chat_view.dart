import 'dart:async';

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
class IrisChatView extends StatefulWidget {
  const IrisChatView({
    required this.relay,
    this.leading,
    this.feedCubit,
    this.sendCubit,
    super.key,
  });

  final IrisRelay relay;

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

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _feedSub = _feed.stream.listen((state) => _send.reconcile(state.messages));
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
              builder: (context, outgoing) => Stack(
                children: [
                  _list(context, feed, outgoing),
                  IrisComposer(enabled: !feed.killed, onSend: _send.send),
                ],
              ),
            ),
      );

  Widget _list(
    BuildContext context,
    IrisFeedState feed,
    List<IrisOutgoing> outgoing,
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
    return switch (failure?.kind) {
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
      IrisFailureKind.unauthorized || IrisFailureKind.forbidden =>
        AppAlert.destructive(content: Text(l10n.mastermindIrisAccessLost)),
      _ => null,
    };
  }
}
