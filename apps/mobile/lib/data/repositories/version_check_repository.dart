import 'dart:io' show Platform;

import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/data/models/mobile_version_check.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:package_info_plus/package_info_plus.dart';

typedef InstalledVersionLoader = Future<String> Function();
typedef MobilePlatformLoader = String? Function();

class VersionCheckRepository {
  VersionCheckRepository({
    ApiClient? apiClient,
    InstalledVersionLoader? installedVersionLoader,
    MobilePlatformLoader? platformLoader,
  }) : _apiClient = apiClient ?? ApiClient(),
       _installedVersionLoader =
           installedVersionLoader ?? _defaultInstalledVersionLoader,
       _platformLoader = platformLoader ?? _defaultPlatformLoader;

  final ApiClient _apiClient;
  final InstalledVersionLoader _installedVersionLoader;
  final MobilePlatformLoader _platformLoader;

  static Future<String> _defaultInstalledVersionLoader() async {
    final packageInfo = await PackageInfo.fromPlatform();
    return packageInfo.version;
  }

  static String? _defaultPlatformLoader() {
    if (Platform.isIOS) return 'ios';
    if (Platform.isAndroid) return 'android';
    return null;
  }

  Future<MobileVersionCheck?> checkCurrentVersion() async {
    final platform = _platformLoader();
    if (platform == null) return null;

    final version = await _installedVersionLoader();
    final response = await _apiClient.getJson(
      '${MobileEndpoints.versionCheck}?platform=$platform&version=$version',
      requiresAuth: false,
    );

    return MobileVersionCheck.fromJson(response);
  }
}
