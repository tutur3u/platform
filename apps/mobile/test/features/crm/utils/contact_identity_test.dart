import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/crm/crm_models.dart';
import 'package:mobile/features/crm/utils/contact_identity.dart';

void main() {
  test('collapses spaced and repeated names into one', () {
    expect(collapseContactName('Ada  Lovelace'), 'Ada Lovelace');
    expect(collapseContactName('Ada Lovelace   Ada Lovelace'), 'Ada Lovelace');
    expect(
      contactPrimaryName(
        displayName: 'Ada Lovelace Ada Lovelace',
        fullName: 'Ada  Lovelace',
        fallback: 'id',
      ),
      'Ada Lovelace',
    );
    expect(
      contactAlternateName(
        displayName: 'Ada Lovelace Ada Lovelace',
        fullName: 'Ada Lovelace',
      ),
      isNull,
    );
  });

  test('keeps a real alternate name and does not join the phone', () {
    expect(
      contactSecondaryLine(
        displayName: 'Ada',
        fullName: 'Ada Lovelace',
        email: 'ada@example.com',
        phone: '+84 901 234 567',
      ),
      'Ada Lovelace',
    );
    expect(
      contactPhoneLine(
        displayName: 'Ada',
        fullName: 'Ada Lovelace',
        email: 'ada@example.com',
        phone: '+84 901 234 567',
      ),
      isNull,
    );
    expect(contactPhoneLine(phone: '+84 901 234 567'), '+84 901 234 567');
    expect(contactSecondaryLine(phone: '+84 901 234 567'), isNull);
  });

  test('groups directory rows by the first letter', () {
    final groups = contactListGroups(const [
      CrmUser(id: 'z', workspaceId: 'ws', fullName: 'Zoe'),
      CrmUser(id: 'a', workspaceId: 'ws', displayName: 'Ada'),
      CrmUser(id: 'b', workspaceId: 'ws', fullName: 'Binh'),
    ]);
    expect(groups.map((group) => group.label), ['A', 'B', 'Z']);
    expect(groups.first.users.single.id, 'a');
  });
}
