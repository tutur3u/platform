import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/audience_mode/audience_mode.dart';
import 'package:mobile/features/audience_mode/audience_mode_store.dart';

void main() {
  group('resolveAudienceMode', () {
    test('falls back to General when nothing is stored', () {
      expect(resolveAudienceMode(), (
        mode: AudienceMode.general,
        source: AudienceModeSource.fallback,
      ));
    });

    test('the personal choice beats the admin default', () {
      expect(
        resolveAudienceMode(
          override: AudienceMode.general,
          workspaceDefault: AudienceMode.education,
          account: AudienceMode.education,
        ),
        (mode: AudienceMode.general, source: AudienceModeSource.override),
      );
    });

    test('the admin default beats the account preference', () {
      expect(
        resolveAudienceMode(
          workspaceDefault: AudienceMode.education,
          account: AudienceMode.general,
        ),
        (
          mode: AudienceMode.education,
          source: AudienceModeSource.workspaceDefault,
        ),
      );
    });

    test('the account preference applies without workspace layers', () {
      expect(resolveAudienceMode(account: AudienceMode.education), (
        mode: AudienceMode.education,
        source: AudienceModeSource.account,
      ));
    });
  });

  test('parses only known wire values', () {
    expect(AudienceMode.parse('education'), AudienceMode.education);
    expect(AudienceMode.parse(' General '), AudienceMode.general);
    expect(AudienceMode.parse('retail'), isNull);
    expect(AudienceMode.parse(null), isNull);
    expect(AudienceMode.parse(3), isNull);
  });

  test('only Education adds the Today widget; General Home is unchanged', () {
    expect(AudienceMode.general.profile.homeWidgets, isEmpty);
    expect(AudienceMode.education.profile.homeWidgets, [
      classesTodayHomeWidgetId,
    ]);
  });

  test('stored layers round-trip and tolerate malformed JSON', () {
    const layers = AudienceModeLayers(
      personal: AudienceMode.general,
      workspaceDefault: AudienceMode.education,
    );
    expect(AudienceModeLayers.fromJson(layers.toJson()), layers);
    expect(AudienceModeLayers.fromJson('junk'), const AudienceModeLayers());
  });
}
