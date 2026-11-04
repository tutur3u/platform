import 'mastermind_home_fixture.dart';

String decisionId(int n) => 'd_${n.toRadixString(16).padLeft(12, '0')}';

/// One synthetic journal decision. A null [why] leaves the field out, which is
/// how the publisher says it recorded none.
Map<String, dynamic> decisionRow(
  int n, {
  String at = '2026-01-31T10:00:00+00:00',
  String? title,
  String area = 'finance',
  String risk = 'low',
  String by = 'mastermind',
  String category = 'auto',
  String? why = 'Because the numbers agreed.',
  bool reversible = true,
  String? product = 'Tuturuuu',
}) => {
  'id': decisionId(n),
  'at': at,
  'title': title ?? 'Decision $n',
  'area': area,
  'risk': risk,
  'by': by,
  'category': category,
  'why': ?why,
  'reversible': reversible,
  'product': ?product,
};

/// A synthetic export whose journal is exactly [rows], with [skipped] older
/// entries the snapshot left out.
Map<String, dynamic> decisionsJson(
  List<Map<String, dynamic>> rows, {
  int skipped = 0,
}) => homeJson(needsYou: false, security: false)
  ..['decisions'] = rows
  ..['decisions_skipped'] = skipped;
