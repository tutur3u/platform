import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/responsive/breakpoints.dart';
import 'package:mobile/core/responsive/responsive_padding.dart';

void main() {
  group('AppLayout tokens', () {
    test('gutters grow with the device class', () {
      expect(AppLayout.gutter(DeviceClass.compact), 16);
      expect(AppLayout.gutter(DeviceClass.medium), 24);
      expect(AppLayout.gutter(DeviceClass.expanded), 32);
    });

    test('compact pages never constrain width', () {
      for (final kind in AppPageKind.values) {
        expect(AppLayout.maxContentWidth(kind, DeviceClass.compact), isNull);
      }
    });

    test('page kinds order from narrow form to wide root canvas', () {
      for (final deviceClass in [DeviceClass.medium, DeviceClass.expanded]) {
        final form = AppLayout.maxContentWidth(AppPageKind.form, deviceClass)!;
        final reading = AppLayout.maxContentWidth(
          AppPageKind.reading,
          deviceClass,
        )!;
        final detail = AppLayout.maxContentWidth(
          AppPageKind.detail,
          deviceClass,
        )!;
        final root = AppLayout.maxContentWidth(AppPageKind.root, deviceClass)!;
        expect(form, lessThan(reading));
        expect(form, lessThan(detail));
        expect(reading, lessThan(root));
        expect(detail, lessThan(root));
      }
    });

    test('row divider inset aligns with the row text', () {
      expect(
        AppLayout.rowDividerInset,
        AppLayout.rowHorizontalPadding +
            AppLayout.rowLeadingSize +
            AppLayout.rowLeadingGap,
      );
      expect(AppLayout.rowCompactMinHeight, greaterThanOrEqualTo(48));
    });

    test('the rail starts at the expanded breakpoint', () {
      expect(AppLayout.navigationRailMinWidth, Breakpoints.expandedMin);
    });
  });

  group('ResponsivePadding derives from AppLayout', () {
    for (final deviceClass in DeviceClass.values) {
      test('$deviceClass', () {
        expect(
          ResponsivePadding.horizontal(deviceClass),
          AppLayout.gutter(deviceClass),
        );
        expect(
          ResponsivePadding.maxContentWidth(deviceClass),
          AppLayout.maxContentWidth(AppPageKind.detail, deviceClass),
        );
        expect(
          ResponsivePadding.rootContentWidth(deviceClass),
          AppLayout.maxContentWidth(AppPageKind.root, deviceClass),
        );
        expect(
          ResponsivePadding.maxFormWidth(deviceClass),
          AppLayout.maxContentWidth(AppPageKind.form, deviceClass) ??
              double.infinity,
        );
      });
    }

    test('legacy values are preserved', () {
      expect(ResponsivePadding.maxContentWidth(DeviceClass.medium), 600);
      expect(ResponsivePadding.maxContentWidth(DeviceClass.expanded), 720);
      expect(ResponsivePadding.rootContentWidth(DeviceClass.medium), 1120);
      expect(ResponsivePadding.rootContentWidth(DeviceClass.expanded), 1440);
      expect(
        ResponsivePadding.maxFormWidth(DeviceClass.compact),
        double.infinity,
      );
      expect(ResponsivePadding.maxFormWidth(DeviceClass.expanded), 480);
    });
  });

  group('AppPageInsets.resolve', () {
    test('compact uses the 16dp gutter at full width', () {
      final insets = AppPageInsets.resolve(width: 390);
      expect(insets.left, 16);
      expect(insets.right, 16);
      expect(insets.top, AppLayout.pageTop);
    });

    test('medium centres detail content at 600dp', () {
      final insets = AppPageInsets.resolve(width: 700);
      expect(insets.left, 24 + 50);
      expect(insets.right, 24 + 50);
      expect(700 - insets.horizontal, 600 - 48);
    });

    test('expanded root pages keep gutters until 1440dp', () {
      expect(
        AppPageInsets.resolve(width: 1200, kind: AppPageKind.root).left,
        32,
      );
      final wide = AppPageInsets.resolve(width: 1640, kind: AppPageKind.root);
      expect(wide.left, 32 + 100);
    });

    test('safe areas apply inside the gutter without double counting', () {
      final notch = AppPageInsets.resolve(
        width: 390,
        safeArea: const EdgeInsets.only(left: 44),
      );
      expect(notch.left, 16 + 44);
      expect(notch.right, 16);
      final centred = AppPageInsets.resolve(
        width: 1200,
        safeArea: const EdgeInsets.only(left: 44),
      );
      expect(centred.left, 32 + 240);
    });

    test('full-bleed drops gutters but keeps safe areas and bottom', () {
      final insets = AppPageInsets.resolve(
        width: 1200,
        fullBleed: true,
        top: 0,
        bottom: 90,
        safeArea: const EdgeInsets.only(left: 10, right: 20),
      );
      expect(insets, const EdgeInsets.fromLTRB(10, 0, 20, 90));
    });
  });
}
