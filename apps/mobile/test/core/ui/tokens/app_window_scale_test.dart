import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/ui/tokens/app_window_scale.dart';

class _SizeDependentScaler extends TextScaler {
  const _SizeDependentScaler();

  @override
  double scale(double fontSize) => fontSize * (fontSize <= 16 ? 1.5 : 1.1);

  @override
  double get textScaleFactor => 1.5;
}

void main() {
  test('window text factor steps at each logical width boundary', () {
    expect(AppWindowScale.textFactor(599.9), 1);
    expect(AppWindowScale.textFactor(600), 1.06);
    expect(AppWindowScale.textFactor(839.9), 1.06);
    expect(AppWindowScale.textFactor(840), 1.12);
    expect(AppWindowScale.textFactor(1679.9), 1.12);
    expect(AppWindowScale.textFactor(1680), 1.18);
  });

  test('window and user factors preserve per-font platform scaling', () {
    final scaler = AppWindowScale.textScaler(
      width: 1440,
      userFactor: 1.1,
      platform: const _SizeDependentScaler(),
    );

    expect(scaler.scale(16), closeTo(29.568, 0.001));
    expect(scaler.scale(24), closeTo(32.5248, 0.001));
  });

  test('the cap applies to the combined factor at each font size', () {
    final scaler = AppWindowScale.textScaler(
      width: 1680,
      userFactor: 1.4,
      platform: const _SizeDependentScaler(),
    );

    expect(scaler.scale(16), 32);
    expect(scaler.scale(24), closeTo(43.6128, 0.001));
    expect(scaler.scale(0), 0);
  });
}
