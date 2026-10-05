import 'dart:async';
import 'dart:io';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:http/http.dart' as http;
import 'package:mobile/data/sources/api_client.dart';

/// Interface signals are hints. Requests still handle transport errors.
Future<bool> hasNetworkConnection() async {
  try {
    return (await Connectivity().checkConnectivity()).any(
      (result) => result != ConnectivityResult.none,
    );
  } on Object {
    return true;
  }
}

bool isOfflineTransportFailure(Object error) =>
    error is ApiException && error.failureKind == ApiFailureKind.transport ||
    error is SocketException ||
    error is TimeoutException ||
    error is http.ClientException;
