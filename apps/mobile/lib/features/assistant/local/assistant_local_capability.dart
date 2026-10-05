import 'dart:ffi';
import 'dart:io';

import 'package:device_info_plus/device_info_plus.dart';

/// Conservative admission, not a guarantee of available memory or speed.
/// The current small-model catalogue requires 4 GiB installed RAM. A verified
/// native model must still load successfully before the UI reports readiness.
bool permitsAssistantLocalInference({
  required Abi abi,
  required int memoryMiB,
  int? androidSdk,
}) {
  if (memoryMiB < 4096) return false;
  return switch (abi) {
    Abi.androidArm64 => androidSdk != null && androidSdk >= 28,
    Abi.iosArm64 ||
    Abi.macosArm64 ||
    Abi.linuxArm64 ||
    Abi.linuxX64 ||
    Abi.windowsX64 => true,
    _ => false,
  };
}

int linuxPhysicalMemoryMiB(String meminfo) {
  final value = RegExp(
    r'^MemTotal:\s+(\d+)\s+kB$',
    multiLine: true,
  ).firstMatch(meminfo)?.group(1);
  return (int.tryParse(value ?? '') ?? 0) ~/ 1024;
}

Future<bool> supportsAssistantLocalInference() async {
  final abi = Abi.current();
  final info = DeviceInfoPlugin();
  try {
    if (Platform.isAndroid) {
      if (abi != Abi.androidArm64) return false;
      final device = await info.androidInfo;
      return permitsAssistantLocalInference(
        abi: abi,
        memoryMiB: device.physicalRamSize,
        androidSdk: device.version.sdkInt,
      );
    }
    final memoryMiB = switch (abi) {
      Abi.iosArm64 => (await info.iosInfo).physicalRamSize,
      // macOS sysctl returns bytes, while iOS/Android/Windows return MiB.
      Abi.macosArm64 => (await info.macOsInfo).memorySize ~/ (1024 * 1024),
      Abi.windowsX64 => (await info.windowsInfo).systemMemoryInMegabytes,
      Abi.linuxArm64 || Abi.linuxX64 => linuxPhysicalMemoryMiB(
        await File('/proc/meminfo').readAsString(),
      ),
      _ => 0,
    };
    return permitsAssistantLocalInference(abi: abi, memoryMiB: memoryMiB);
  } on Object {
    // Unknown hardware fails closed rather than attempting unsafe allocation.
    return false;
  }
}
