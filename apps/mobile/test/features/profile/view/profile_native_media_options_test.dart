import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image_picker/image_picker.dart';
import 'package:mobile/features/profile/view/profile_avatar_picker.dart';
import 'package:mobile/features/profile/view/profile_banner_picker.dart';

import '../../../helpers/helpers.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  for (final banner in [false, true]) {
    testWidgets('native ${banner ? 'banner' : 'avatar'} codec options', (
      tester,
    ) async {
      final directory = Directory.systemTemp.createTempSync(
        'profile-native-options-',
      );
      addTearDown(() => directory.deleteSync(recursive: true));
      final sourcePath = '${directory.path}/native-converted.jpg';
      File(sourcePath).writeAsBytesSync([0xff, 0xd8, 0xff, 0xd9]);
      final calls = <MethodCall>[];
      const pickerChannel = MethodChannel('plugins.flutter.io/image_picker');
      const cropChannel = MethodChannel('plugins.hunghd.vn/image_cropper');
      final messenger =
          TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
            ..setMockMethodCallHandler(pickerChannel, (call) async {
              calls.add(call);
              return sourcePath;
            })
            ..setMockMethodCallHandler(cropChannel, (call) async {
              calls.add(call);
              return '/cropped.jpg';
            });
      addTearDown(() {
        messenger
          ..setMockMethodCallHandler(pickerChannel, null)
          ..setMockMethodCallHandler(cropChannel, null);
      });
      final file = banner
          ? await const ProfileBannerPicker().pickImage(ImageSource.gallery)
          : await const ProfileAvatarPicker().pickImage(ImageSource.gallery);
      expect(file!.path, sourcePath);
      final pick = calls.single.arguments as Map;
      expect(pick['imageQuality'], 90);
      expect(pick['maxWidth'], banner ? 2560 : 1024);
      expect(pick['maxHeight'], banner ? 1440 : 1024);
      expect(pick['requestFullMetadata'], isFalse);
      const ownerKey = ValueKey('native-crop-owner');
      await tester.pumpApp(const SizedBox(key: ownerKey));
      final context = tester.element(find.byKey(ownerKey));
      final cropped = await tester.runAsync(
        () => banner
            ? const ProfileBannerPicker().cropImage(context, file)
            : const ProfileAvatarPicker().cropImage(context, file),
      );
      expect(cropped!.path, '/cropped.jpg');
      final crop = calls.last.arguments as Map;
      expect(crop['compress_format'], 'jpg');
      expect(crop['compress_quality'], 90);
      expect(crop['ratio_x'], banner ? 3 : 1);
      expect(crop['ratio_y'], 1);
    });
  }
}
