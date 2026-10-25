import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';

/// Runs every test in the enclosing group on a phone-sized view.
///
/// The default 800x600 test view is wide enough for split list/detail
/// layouts; suites that cover the compact push flow pin a phone instead.
void usePhoneSurface({Size size = const Size(390, 844)}) {
  setUp(() {
    TestWidgetsFlutterBinding.instance.platformDispatcher.implicitView!
      ..physicalSize = size
      ..devicePixelRatio = 1;
  });
  tearDown(() {
    TestWidgetsFlutterBinding.instance.platformDispatcher.implicitView!
      ..resetPhysicalSize()
      ..resetDevicePixelRatio();
  });
}
