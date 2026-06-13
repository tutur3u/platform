import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

void main() {
  Widget buildTestApp(Widget child, {required Size size}) {
    return MediaQuery(
      data: MediaQueryData(size: size),
      child: shad.ShadcnApp(
        theme: const shad.ThemeData(colorScheme: shad.ColorSchemes.lightZinc),
        localizationsDelegates: const [shad.ShadcnLocalizations.delegate],
        home: Builder(builder: (context) => child),
      ),
    );
  }

  group('responsiveValue', () {
    testWidgets('returns compact value on small screen', (tester) async {
      String? result;
      await tester.pumpWidget(
        buildTestApp(
          Builder(
            builder: (context) {
              result = responsiveValue(
                context,
                compact: 'small',
                medium: 'mid',
                expanded: 'big',
              );
              return const SizedBox();
            },
          ),
          size: const Size(400, 800),
        ),
      );
      expect(result, 'small');
    });

    testWidgets('returns medium value on tablet screen', (tester) async {
      String? result;
      await tester.pumpWidget(
        buildTestApp(
          Builder(
            builder: (context) {
              result = responsiveValue(
                context,
                compact: 'small',
                medium: 'mid',
                expanded: 'big',
              );
              return const SizedBox();
            },
          ),
          size: const Size(700, 1024),
        ),
      );
      expect(result, 'mid');
    });

    testWidgets('returns expanded value on large screen', (tester) async {
      String? result;
      await tester.pumpWidget(
        buildTestApp(
          Builder(
            builder: (context) {
              result = responsiveValue(
                context,
                compact: 'small',
                medium: 'mid',
                expanded: 'big',
              );
              return const SizedBox();
            },
          ),
          size: const Size(1024, 768),
        ),
      );
      expect(result, 'big');
    });

    testWidgets('falls back to medium when expanded is null', (tester) async {
      String? result;
      await tester.pumpWidget(
        buildTestApp(
          Builder(
            builder: (context) {
              result = responsiveValue(
                context,
                compact: 'small',
                medium: 'mid',
              );
              return const SizedBox();
            },
          ),
          size: const Size(1024, 768),
        ),
      );
      expect(result, 'mid');
    });

    testWidgets('falls back to compact when medium and expanded are null', (
      tester,
    ) async {
      String? result;
      await tester.pumpWidget(
        buildTestApp(
          Builder(
            builder: (context) {
              result = responsiveValue(context, compact: 'small');
              return const SizedBox();
            },
          ),
          size: const Size(1024, 768),
        ),
      );
      expect(result, 'small');
    });

    testWidgets('falls back from expanded to compact when medium is null', (
      tester,
    ) async {
      String? result;
      await tester.pumpWidget(
        buildTestApp(
          Builder(
            builder: (context) {
              result = responsiveValue(
                context,
                compact: 'small',
                expanded: 'big',
              );
              return const SizedBox();
            },
          ),
          size: const Size(700, 1024),
        ),
      );
      // medium width, but medium is null, so fallback to compact
      expect(result, 'small');
    });
  });

  group('ResponsiveContext extension', () {
    testWidgets('isCompact returns true on small screen', (tester) async {
      bool? isCompact;
      await tester.pumpWidget(
        buildTestApp(
          Builder(
            builder: (context) {
              isCompact = context.isCompact;
              return const SizedBox();
            },
          ),
          size: const Size(400, 800),
        ),
      );
      expect(isCompact, isTrue);
    });

    testWidgets('isMedium returns true on tablet screen', (tester) async {
      bool? isMedium;
      await tester.pumpWidget(
        buildTestApp(
          Builder(
            builder: (context) {
              isMedium = context.isMedium;
              return const SizedBox();
            },
          ),
          size: const Size(700, 1024),
        ),
      );
      expect(isMedium, isTrue);
    });

    testWidgets('isExpanded returns true on large screen', (tester) async {
      bool? isExpanded;
      await tester.pumpWidget(
        buildTestApp(
          Builder(
            builder: (context) {
              isExpanded = context.isExpanded;
              return const SizedBox();
            },
          ),
          size: const Size(1024, 768),
        ),
      );
      expect(isExpanded, isTrue);
    });
  });
}
