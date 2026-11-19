import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/theme/appearance/brand_accents.dart';
import 'package:mobile/data/models/crm/crm_models.dart';
import 'package:mobile/features/crm/utils/contact_brand_color.dart';
import 'package:mobile/features/crm/view/contact_group_editor.dart';
import 'package:mobile/features/crm/view/contact_tag_editor.dart';

import '../../../helpers/pump_app.dart';

void main() {
  test('brand tag colours are the four logo marks', () {
    final marks = BrandAccents.core.map(contactBrandMarkHex).toSet();
    expect(marks, hasLength(4));
    for (final mark in marks) {
      expect(mark, startsWith('#'));
      expect(mark.length, 7);
    }
    expect(
      contactBrandAccentForHex(contactBrandMarkHex(BrandAccents.growth)),
      BrandAccents.growth,
    );
    expect(contactBrandAccentForHex('#000000'), isNull);
  });

  testWidgets('group editor saves the name, notes and guest flag', (
    tester,
  ) async {
    Map<String, dynamic>? saved;
    await tester.pumpThemedHome(
      ContactGroupEditor(
        onSubmit: (payload) async {
          saved = payload;
        },
      ),
    );
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).at(0), 'Morning class');
    await tester.enterText(find.byType(TextField).at(1), 'Weekday group');
    await tester.tap(find.text('Guest group'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('contact-group-save')));
    await tester.pumpAndSettle();
    expect(saved?['name'], 'Morning class');
    expect(saved?['notes'], 'Weekday group');
    expect(saved?['is_guest'], isTrue);
    expect(tester.takeException(), isNull);
  });

  testWidgets('tag editor saves a brand mark and the selected groups', (
    tester,
  ) async {
    ({String name, String color, List<String> groupIds})? saved;
    await tester.pumpThemedHome(
      ContactTagEditor(
        groups: const [
          CrmGroup(id: 'g1', name: 'Morning'),
          CrmGroup(id: 'g2', name: 'Evening'),
        ],
        onSubmit: ({required color, required groupIds, required name}) async {
          saved = (name: name, color: color, groupIds: groupIds);
        },
      ),
    );
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), 'Beginner');
    await tester.tap(find.text('Growth'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Morning'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('contact-tag-save')));
    await tester.pumpAndSettle();
    expect(saved?.name, 'Beginner');
    expect(saved?.color, contactBrandMarkHex(BrandAccents.growth));
    expect(saved?.groupIds, ['g1']);
    expect(tester.takeException(), isNull);
  });
}
