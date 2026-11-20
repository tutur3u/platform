import 'package:mobile/data/models/crm/crm_models.dart';

enum CrmCsvField {
  fullName('full_name'),
  displayName('display_name'),
  email('email', privateInfo: true),
  phone('phone', privateInfo: true),
  gender('gender', privateInfo: true),
  birthday('birthday', privateInfo: true),
  ethnicity('ethnicity', privateInfo: true),
  nationalId('national_id', privateInfo: true),
  address('address', privateInfo: true),
  note('note', privateInfo: true),
  archived('archived'),
  archivedUntil('archived_until'),
  isGuest('is_guest'),
  requireAttention('require_attention'),
  linkedPromotionsCount('linked_promotions_count', privateInfo: true),
  linkedPromotionNames('linked_promotion_names', privateInfo: true);

  const CrmCsvField(this.header, {this.privateInfo = false});
  final String header;
  final bool privateInfo;

  bool visibleTo(CrmUserPermissions? permissions) => switch (this) {
    fullName || displayName => permissions?.hasPublicInfo ?? false,
    _ when privateInfo => permissions?.hasPrivateInfo ?? false,
    _ =>
      (permissions?.hasPublicInfo ?? false) ||
          (permissions?.hasPrivateInfo ?? false),
  };

  String? read(CrmUser user) => switch (this) {
    fullName => user.fullName,
    displayName => user.displayName,
    email => user.email,
    phone => user.phone,
    gender => user.gender,
    birthday => user.birthday,
    ethnicity => user.ethnicity,
    nationalId => user.nationalId,
    address => user.address,
    note => user.note,
    archived => user.archived.toString(),
    archivedUntil => user.archivedUntil,
    isGuest => user.isGuest.toString(),
    requireAttention => user.requireAttention.toString(),
    linkedPromotionsCount => user.linkedPromotionsCount.toString(),
    linkedPromotionNames => user.linkedPromotionNames,
  };
}

String buildCrmCsv(Iterable<CrmUser> users, List<CrmCsvField> fields) => [
  fields.map((field) => escapeCrmCsvCell(field.header)).join(','),
  for (final user in users)
    fields.map((field) => escapeCrmCsvCell(field.read(user))).join(','),
].join('\n');

const _dangerousSpreadsheetFormulaPrefixes = {'=', '+', '-', '@'};

bool _hasDangerousSpreadsheetFormulaPrefix(String value) {
  final trimmed = value.trimLeft();
  if (trimmed.isEmpty) return false;
  return _dangerousSpreadsheetFormulaPrefixes.contains(trimmed[0]);
}

String escapeCrmCsvCell(String? value) {
  final rawValue = value ?? '';
  final safeValue = _hasDangerousSpreadsheetFormulaPrefix(rawValue)
      ? "'$rawValue"
      : rawValue;
  final escapedValue = safeValue.replaceAll('"', '""');
  return '"$escapedValue"';
}
