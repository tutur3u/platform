import 'dart:ffi';
import 'dart:io';

import 'package:device_info_plus/device_info_plus.dart';

/// Build support is not proof of model readiness. Loading the verified model
/// must still succeed; memory pressure and unsupported devices stay visible.
Future<bool> supportsAssistantLocalInference() async {
  final abi = Abi.current();
  if (Platform.isAndroid) {
    if (abi != Abi.androidArm64) return false;
    final device = await DeviceInfoPlugin().androidInfo;
    return device.version.sdkInt >= 28;
  }
  return switch (abi) {
    Abi.iosArm64 ||
    Abi.macosArm64 ||
    Abi.linuxArm64 ||
    Abi.linuxX64 ||
    Abi.windowsX64 => true,
    _ => false,
  };
}
