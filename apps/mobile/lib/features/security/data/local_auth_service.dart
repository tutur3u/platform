import 'dart:developer' as developer;

import 'package:local_auth/local_auth.dart';

abstract interface class LocalAuthService {
  Future<bool> authenticate({required String reason});

  Future<bool> isDeviceSupported();
}

class DeviceLocalAuthService implements LocalAuthService {
  DeviceLocalAuthService({LocalAuthentication? localAuthentication})
    : _localAuthentication = localAuthentication ?? LocalAuthentication();

  final LocalAuthentication _localAuthentication;

  @override
  Future<bool> authenticate({required String reason}) async {
    try {
      final supported = await isDeviceSupported();
      if (!supported) {
        return false;
      }

      return await _localAuthentication.authenticate(
        localizedReason: reason,
        persistAcrossBackgrounding: true,
      );
    } on Object catch (error, stackTrace) {
      developer.log(
        'local authentication failed',
        name: 'DeviceLocalAuthService',
        error: error,
        stackTrace: stackTrace,
      );
      return false;
    }
  }

  @override
  Future<bool> isDeviceSupported() async {
    try {
      return await _localAuthentication.isDeviceSupported();
    } on Object catch (error, stackTrace) {
      developer.log(
        'local authentication support check failed',
        name: 'DeviceLocalAuthService',
        error: error,
        stackTrace: stackTrace,
      );
      return false;
    }
  }
}
