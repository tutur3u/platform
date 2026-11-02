import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/offline_preparation_coordinator.dart';
import 'package:mobile/core/feature_flags/mobile_flags.dart';
import 'package:mobile/l10n/l10n.dart';

class HomeOfflineFrame extends StatefulWidget {
  const HomeOfflineFrame({required this.child, this.networkChanges, super.key});
  final Stream<List<ConnectivityResult>>? networkChanges;
  final Widget child;
  @override
  State<HomeOfflineFrame> createState() => _HomeOfflineFrameState();
}

class _HomeOfflineFrameState extends State<HomeOfflineFrame> {
  static Stream<List<ConnectivityResult>> _changes() async* {
    yield await Connectivity().checkConnectivity();
    yield* Connectivity().onConnectivityChanged;
  }

  late final Stream<List<ConnectivityResult>> _network = _changes();
  @override
  Widget build(BuildContext context) {
    final enabled =
        context.watch<MobileFlags?>()?.enabled(MobileFlag.offlineReadHome) ??
        false;
    if (!enabled) return widget.child;
    return StreamBuilder<List<ConnectivityResult>>(
      stream: widget.networkChanges ?? _network,
      builder: (_, snapshot) => HomeOfflineStatus(
        offline:
            !snapshot.hasError &&
            (!snapshot.hasData ||
                !snapshot.data!.any(
                  (value) => value != ConnectivityResult.none,
                )),
        child: widget.child,
      ),
    );
  }
}

class HomeOfflineStatus extends InheritedWidget {
  const HomeOfflineStatus({
    required this.offline,
    required super.child,
    super.key,
  });
  final bool offline;
  static bool of(BuildContext context) =>
      context
          .dependOnInheritedWidgetOfExactType<HomeOfflineStatus>()
          ?.offline ??
      false;
  @override
  bool updateShouldNotify(HomeOfflineStatus oldWidget) =>
      offline != oldWidget.offline;
}

class HomeOnlineCard extends StatelessWidget {
  const HomeOnlineCard({required this.child, super.key});
  final Widget child;
  @override
  Widget build(BuildContext context) => HomeOfflineStatus.of(context)
      ? Text(context.l10n.homeNotAvailableOffline)
      : child;
}

class HomeLastSynced extends StatelessWidget {
  const HomeLastSynced({required this.wsId, super.key});
  final String wsId;
  @override
  Widget build(BuildContext context) {
    if (!(context.watch<MobileFlags?>()?.enabled(MobileFlag.offlineReadHome) ??
        false)) {
      return const SizedBox.shrink();
    }
    return ValueListenableBuilder<OfflinePreparationState>(
      valueListenable: OfflinePreparationCoordinator.instance.state,
      builder: (_, state, _) {
        final time =
            state.userId == currentCacheUserId() && state.workspaceId == wsId
            ? state.products['home']?.lastSuccess
            : null;
        return Text(
          time == null
              ? context.l10n.offlineStatusNeverSynced
              : context.l10n.offlineStatusLastSynced(
                  DateFormat.yMd(
                    Localizations.localeOf(context).toLanguageTag(),
                  ).add_jm().format(time.toLocal()),
                ),
        );
      },
    );
  }
}
