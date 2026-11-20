import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/router/deep_links.dart';
import 'package:mobile/core/router/routes.dart';

void main() {
  const split = '9abafaf3-e1ca-4fcf-8729-f3916b0c913b';
  const participant = 'b957a8f4-0a6a-4a27-a63a-8101089a1503';
  const base = 'https://tuturuuu.com/vi/our-workspace/finance/bill-splits';

  test('keeps workspace authority and routes to a specific participant', () {
    final link = resolveMobileDeepLink(
      Uri.parse('$base/$split/participants/$participant'),
    )!;
    expect(link.workspaceSlug, 'our-workspace');
    final location = Uri.parse(link.location);
    expect(location.path, Routes.financeBillSplits);
    expect(location.queryParameters, {
      'split': split,
      'participant': participant,
    });
  });

  test(
    'routes to settlement without accepting arbitrary path or query targets',
    () {
      final link = resolveMobileDeepLink(
        Uri.parse('$base/$split/settlement?participant=$participant'),
      )!;
      expect(Uri.parse(link.location).queryParameters, {
        'split': split,
        'settlement': '1',
      });
      expect(resolveMobileDeepLink(Uri.parse('$base/not-an-id')), isNull);
      expect(
        resolveMobileDeepLink(Uri.parse('$base/$split/participants/bogus')),
        isNull,
      );
      expect(
        resolveMobileDeepLink(Uri.parse('$base/$split/settlement/trailing')),
        isNull,
      );
    },
  );
}
