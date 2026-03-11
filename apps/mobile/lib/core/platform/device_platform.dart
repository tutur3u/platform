import 'dart:io' show Platform;

abstract interface class DevicePlatform {
  bool get isAndroid;
  bool get isIOS;
}

class DefaultDevicePlatform implements DevicePlatform {
  const DefaultDevicePlatform();

  @override
  bool get isAndroid => Platform.isAndroid;

  @override
  bool get isIOS => Platform.isIOS;
}
