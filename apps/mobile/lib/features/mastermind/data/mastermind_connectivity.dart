import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:mobile/core/cache/offline_network.dart';

/// Whether the device has a network interface up: the current answer first,
/// then every change. An interface is only a hint; the refresh classifies the
/// real outcome.
Stream<bool> mastermindOnlineChanges() async* {
  yield await hasNetworkConnection();
  yield* Connectivity().onConnectivityChanged.map(
    (results) => results.any((result) => result != ConnectivityResult.none),
  );
}
