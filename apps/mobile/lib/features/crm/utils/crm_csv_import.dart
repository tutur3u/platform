List<List<String>> _parseDelimitedRows(String source, String delimiter) {
  final rows = <List<String>>[];
  final currentRow = <String>[];
  final currentCell = StringBuffer();
  var inQuotes = false;

  for (var index = 0; index < source.length; index += 1) {
    final character = source[index];
    final nextCharacter = index + 1 < source.length ? source[index + 1] : null;

    if (character == '"') {
      if (inQuotes && nextCharacter == '"') {
        currentCell.write('"');
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && character == delimiter) {
      currentRow.add(currentCell.toString().trim());
      currentCell.clear();
      continue;
    }

    if (!inQuotes && (character == '\n' || character == '\r')) {
      if (character == '\r' && nextCharacter == '\n') {
        index += 1;
      }
      currentRow.add(currentCell.toString().trim());
      currentCell.clear();
      if (currentRow.any((value) => value.isNotEmpty)) {
        rows.add(List<String>.from(currentRow));
      }
      currentRow.clear();
      continue;
    }

    currentCell.write(character);
  }

  if (inQuotes) throw const FormatException('Unclosed quoted CSV field');
  currentRow.add(currentCell.toString().trim());
  if (currentRow.any((value) => value.isNotEmpty)) {
    rows.add(List<String>.from(currentRow));
  }

  return rows;
}

({List<Map<String, dynamic>> rows, int skipped}) parseCrmImportRows(
  String source,
) {
  final normalized = source.replaceAll('\ufeff', '').trim();
  if (normalized.isEmpty) {
    return (rows: const [], skipped: 0);
  }

  final firstLine = normalized.split(RegExp(r'\r?\n')).first;
  final delimiter = firstLine.contains('\t') ? '\t' : ',';
  final rows = _parseDelimitedRows(normalized, delimiter);
  if (rows.isEmpty) {
    return (rows: const [], skipped: 0);
  }

  final header = rows.first.map((value) => value.toLowerCase()).toList();
  final hasHeader =
      header.contains('email') ||
      header.contains('full_name') ||
      header.contains('fullname') ||
      header.contains('full name');
  final contentRows = hasHeader ? rows.skip(1) : rows.skip(0);
  final seenEmails = <String>{};
  final items = <Map<String, dynamic>>[];

  final emailIndex = hasHeader ? header.indexOf('email') : 0;
  final nameIndex = hasHeader
      ? header.indexWhere(
          (field) =>
              const {'full_name', 'fullname', 'full name'}.contains(field),
        )
      : 1;
  final emailPattern = RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$');
  for (final row in contentRows) {
    final email =
        (emailIndex >= 0 && emailIndex < row.length ? row[emailIndex] : '')
            .trim()
            .toLowerCase();
    final fullName =
        (nameIndex >= 0 && nameIndex < row.length ? row[nameIndex] : '').trim();

    if (!emailPattern.hasMatch(email) || seenEmails.contains(email)) {
      continue;
    }

    seenEmails.add(email);
    items.add({
      'email': email,
      'fullName': fullName.isEmpty ? email.split('@').first : fullName,
    });
  }

  return (rows: items, skipped: contentRows.length - items.length);
}
