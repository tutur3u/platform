import 'dart:convert';

class TipTapMention {
  const TipTapMention({
    required this.displayName,
    this.userId,
    this.entityId,
    this.entityType,
    this.avatarUrl,
    this.subtitle,
    this.priority,
    this.listColor,
    this.assignees,
  });

  final String? userId;
  final String? entityId;
  final String? entityType;
  final String displayName;
  final String? avatarUrl;
  final String? subtitle;
  final String? priority;
  final String? listColor;
  final List<String>? assignees;
}

class ParsedTipTapDescription {
  const ParsedTipTapDescription({
    required this.markdown,
    required this.plainText,
    this.mentions = const <TipTapMention>[],
  });

  final String markdown;
  final String plainText;
  final List<TipTapMention> mentions;

  bool get hasContent => plainText.trim().isNotEmpty;
}

class _ParseContext {
  _ParseContext();

  final List<TipTapMention> mentions = <TipTapMention>[];

  String addMention(TipTapMention mention) {
    mentions.add(mention);
    return '@@mention:${mentions.length - 1}@@';
  }
}

ParsedTipTapDescription? parseTipTapTaskDescription(String? rawDescription) {
  final trimmed = rawDescription?.trim();
  if (trimmed == null || trimmed.isEmpty) return null;

  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return ParsedTipTapDescription(markdown: trimmed, plainText: trimmed);
  }

  try {
    final decoded = jsonDecode(trimmed);
    final context = _ParseContext();
    final markdown = _collapseWhitespace(
      _extractMarkdown(decoded, context).trim(),
    );
    final plainText = _collapseWhitespace(_extractPlainText(decoded).trim());

    if (markdown.isEmpty && plainText.isEmpty) {
      return ParsedTipTapDescription(markdown: trimmed, plainText: trimmed);
    }

    return ParsedTipTapDescription(
      markdown: markdown.isEmpty ? plainText : markdown,
      plainText: plainText.isEmpty ? trimmed : plainText,
      mentions: List.unmodifiable(context.mentions),
    );
  } on Object {
    return ParsedTipTapDescription(markdown: trimmed, plainText: trimmed);
  }
}

String _collapseWhitespace(String value) {
  return value.replaceAll(RegExp(r'\n{3,}'), '\n\n').trim();
}

String _extractMarkdown(Object? node, _ParseContext context) {
  if (node is List) {
    return node
        .map((item) => _extractMarkdown(item, context))
        .join()
        .trimRight();
  }

  if (node is! Map) return '';

  final type = node['type'];
  final content = node['content'];
  final attrs = node['attrs'];

  switch (type) {
    case 'doc':
      return '${_extractMarkdown(content, context)}\n\n';
    case 'text':
      final text = (node['text'] as String?) ?? '';
      return _applyMarks(_escape(text), node['marks']);
    case 'hardBreak':
      return '  \n';
    case 'horizontalRule':
      return '\n---\n\n';
    case 'paragraph':
      return '${_extractInlineMarkdown(content, context)}\n\n';
    case 'heading':
      final level = (attrs is Map ? attrs['level'] : null) as int? ?? 1;
      final safeLevel = level < 1
          ? 1
          : level > 6
          ? 6
          : level;
      final hashes = '#' * safeLevel;
      return '$hashes ${_extractInlineMarkdown(content, context)}\n\n';
    case 'blockquote':
      final body = _collapseWhitespace(_extractMarkdown(content, context));
      if (body.isEmpty) return '';
      final lines = body
          .split('\n')
          .map((line) => line.trim().isEmpty ? '>' : '> $line')
          .join('\n');
      return '$lines\n\n';
    case 'codeBlock':
      final language = attrs is Map ? (attrs['language'] as String? ?? '') : '';
      return '```$language\n${_extractCodeText(content)}\n```\n\n';
    case 'bulletList':
      return '${_extractListMarkdown(content, context, ordered: false)}\n';
    case 'orderedList':
      final start = (attrs is Map ? attrs['start'] as int? : null) ?? 1;
      return '${_extractListMarkdown(
        content,
        context,
        ordered: true,
        start: start,
      )}\n';
    case 'taskList':
      return '${_extractTaskListMarkdown(content, context)}\n';
    case 'table':
      return _extractTableMarkdown(content);
    case 'image':
    case 'imageResize':
      final src = attrs is Map ? (attrs['src'] as String?) : null;
      final alt = attrs is Map ? (attrs['alt'] as String?) : null;
      if (src != null && src.trim().isNotEmpty) {
        return '![${alt?.trim() ?? ''}](${src.trim()})';
      }
      return '[${alt?.trim().isNotEmpty == true ? alt!.trim() : 'Image'}]';
    case 'video':
      final src = attrs is Map ? (attrs['src'] as String?) : null;
      return src?.trim().isNotEmpty == true
          ? '[Video](${src!.trim()})'
          : '[Video]';
    case 'youtube':
      final src = attrs is Map
          ? (attrs['src'] as String? ?? attrs['videoId'] as String?)
          : null;
      return src?.trim().isNotEmpty == true
          ? '[YouTube](${src!.trim()})'
          : '[YouTube Video]';
    case 'mention':
      final mention = _buildMention(attrs);
      if (mention != null) {
        return context.addMention(mention);
      }
      return '@mention';
    default:
      return _extractMarkdown(content, context);
  }
}

String _extractInlineMarkdown(Object? content, _ParseContext context) {
  if (content is! List) return '';
  return content
      .map((item) => _extractMarkdown(item, context))
      .join()
      .replaceAll(RegExp(r'\n+'), ' ')
      .trimRight();
}

String _extractListMarkdown(
  Object? content,
  _ParseContext context, {
  required bool ordered,
  int start = 1,
}) {
  if (content is! List) return '';
  final buffer = StringBuffer();
  var counter = start;

  for (final item in content) {
    if (item is! Map || item['type'] != 'listItem') continue;
    final prefix = ordered ? '$counter.' : '-';
    buffer.write(_extractListItemMarkdown(item['content'], context, prefix));
    if (ordered) counter += 1;
  }

  return buffer.toString();
}

String _extractTaskListMarkdown(Object? content, _ParseContext context) {
  if (content is! List) return '';
  final buffer = StringBuffer();
  for (final item in content) {
    if (item is! Map || item['type'] != 'taskItem') continue;
    final attrs = item['attrs'];
    final checked = attrs is Map ? attrs['checked'] : null;
    final marker = checked == true ? '- [x]' : '- [ ]';
    buffer.write(_extractListItemMarkdown(item['content'], context, marker));
  }
  return buffer.toString();
}

String _extractListItemMarkdown(
  Object? content,
  _ParseContext context,
  String prefix,
) {
  if (content is! List || content.isEmpty) return '$prefix\n';

  final first = _extractMarkdown(content.first, context).trim();
  final buffer = StringBuffer('$prefix $first\n');

  for (final child in content.skip(1)) {
    final nested = _extractMarkdown(child, context).trimRight();
    if (nested.isEmpty) continue;
    for (final line in nested.split('\n')) {
      if (line.isEmpty) continue;
      buffer.writeln('  $line');
    }
  }

  return buffer.toString();
}

String _extractTableMarkdown(Object? content) {
  if (content is! List || content.isEmpty) return '';

  final rows = <List<String>>[];
  var hasHeader = false;

  for (final row in content) {
    if (row is! Map || row['type'] != 'tableRow') continue;
    final cells = row['content'];
    if (cells is! List) continue;

    final parsedCells = <String>[];
    var rowHasHeader = false;

    for (final cell in cells) {
      if (cell is! Map) continue;
      if (cell['type'] == 'tableHeader') rowHasHeader = true;
      final text = _collapseWhitespace(
        _extractPlainText(cell).replaceAll('|', r'\|').trim(),
      );
      parsedCells.add(text);
    }

    if (parsedCells.isEmpty) continue;
    rows.add(parsedCells);
    hasHeader = hasHeader || rowHasHeader;
  }

  if (rows.isEmpty) return '';

  final width = rows.fold<int>(
    0,
    (current, row) => row.length > current ? row.length : current,
  );

  for (final row in rows) {
    while (row.length < width) {
      row.add('');
    }
  }

  final buffer = StringBuffer()
    ..writeln('| ${rows.first.join(' | ')} |')
    ..writeln('| ${List.filled(width, '---').join(' | ')} |');

  final start = hasHeader ? 1 : 0;
  for (final row in rows.skip(start)) {
    buffer.writeln('| ${row.join(' | ')} |');
  }

  buffer.writeln();
  return buffer.toString();
}

String _extractCodeText(Object? content) {
  if (content is! List) return '';
  final parts = <String>[];

  for (final item in content) {
    if (item is Map && item['type'] == 'text') {
      final text = item['text'] as String?;
      if (text != null) parts.add(text);
      continue;
    }

    final fallback = _extractPlainText(item);
    if (fallback.isNotEmpty) parts.add(fallback);
  }

  return parts.join();
}

String _applyMarks(String text, Object? marks) {
  if (marks is! List || marks.isEmpty) return text;

  var result = text;
  for (final mark in marks) {
    if (mark is! Map) continue;
    final type = mark['type'];
    final attrs = mark['attrs'];

    if (type == 'bold') {
      result = '**$result**';
      continue;
    }
    if (type == 'italic') {
      result = '_${result}_';
      continue;
    }
    if (type == 'strike') {
      result = '~~$result~~';
      continue;
    }
    if (type == 'code') {
      result = '`${result.replaceAll('`', r'\`')}`';
      continue;
    }
    if (type == 'link') {
      final href = attrs is Map ? (attrs['href'] as String?) : null;
      result = href?.trim().isNotEmpty == true
          ? '[$result](${href!.trim()})'
          : result;
      continue;
    }
    if (type == 'underline') {
      result = '<u>$result</u>';
      continue;
    }
    if (type == 'subscript') {
      result = '<sub>$result</sub>';
      continue;
    }
    if (type == 'superscript') {
      result = '<sup>$result</sup>';
    }
  }

  return result;
}

String _escape(String value) {
  final backslash = String.fromCharCode(92);
  return value
      .replaceAll(backslash, '$backslash$backslash')
      .replaceAll('*', r'\*')
      .replaceAll('_', r'\_')
      .replaceAll('`', r'\`')
      .replaceAll('[', r'\[')
      .replaceAll(']', r'\]')
      .replaceAll('(', r'\(')
      .replaceAll(')', r'\)');
}

String _extractPlainText(
  Object? node, {
  int depth = 0,
  int? orderedIndex,
}) {
  if (node is List) {
    return node
        .map(
          (item) => _extractPlainText(
            item,
            depth: depth,
            orderedIndex: orderedIndex,
          ),
        )
        .join()
        .trimRight();
  }

  if (node is! Map) return '';

  final type = node['type'];
  final content = node['content'];
  final attrs = node['attrs'];

  switch (type) {
    case 'doc':
      return _extractPlainText(content, depth: depth);
    case 'text':
      return (node['text'] as String?) ?? '';
    case 'hardBreak':
      return '\n';
    case 'horizontalRule':
      return '\n---\n';
    case 'paragraph':
      return '${_extractPlainText(content, depth: depth)}\n';
    case 'heading':
      return '${_extractPlainText(content, depth: depth)}\n';
    case 'blockquote':
      return '${_extractPlainText(content, depth: depth + 1)}\n';
    case 'codeBlock':
      return '${_extractCodeText(content)}\n';
    case 'bulletList':
      return _extractPlainText(content, depth: depth + 1);
    case 'orderedList':
      final start = (attrs is Map ? attrs['start'] as int? : null) ?? 1;
      if (content is! List) return '';
      var counter = start;
      final buffer = StringBuffer();
      for (final item in content) {
        buffer.write(
          _extractPlainText(item, depth: depth + 1, orderedIndex: counter),
        );
        counter += 1;
      }
      return buffer.toString();
    case 'listItem':
      final indent = '  ' * depth;
      final prefix = orderedIndex != null ? '$orderedIndex.' : '•';
      final text = _extractPlainText(content, depth: depth + 1).trim();
      return '$indent$prefix $text\n';
    case 'taskList':
      return _extractPlainText(content, depth: depth + 1);
    case 'taskItem':
      final indent = '  ' * depth;
      final checked = attrs is Map ? attrs['checked'] : null;
      final checkbox = checked == true ? '[x]' : '[ ]';
      final text = _extractPlainText(content, depth: depth + 1).trim();
      return '$indent$checkbox $text\n';
    case 'table':
      return '${_extractTablePlainText(content)}\n';
    case 'tableRow':
      if (content is! List) return '';
      final row = content
          .map((cell) => _extractPlainText(cell, depth: depth).trim())
          .where((cell) => cell.isNotEmpty)
          .join(' | ');
      return row.isEmpty ? '' : '| $row |\n';
    case 'tableCell':
    case 'tableHeader':
      return _extractPlainText(content, depth: depth).trim();
    case 'image':
    case 'imageResize':
      final alt = attrs is Map ? (attrs['alt'] as String?) : null;
      return '[${alt?.trim().isNotEmpty == true ? alt!.trim() : 'Image'}]';
    case 'video':
      return '[Video]';
    case 'youtube':
      return '[YouTube Video]';
    case 'mention':
      final mention = _buildMention(attrs);
      return '@${mention?.displayName ?? 'mention'}';
    default:
      return _extractPlainText(content, depth: depth);
  }
}

String _extractTablePlainText(Object? content) {
  if (content is! List) return '';
  return content
      .map((row) => _extractPlainText(row).trim())
      .where((row) => row.isNotEmpty)
      .join('\n');
}

TipTapMention? _buildMention(Object? attrs) {
  if (attrs is! Map) return null;

  String? stringValue(String key) {
    final value = attrs[key];
    return value is String && value.trim().isNotEmpty ? value.trim() : null;
  }

  List<String>? stringList(String key) {
    final value = attrs[key];
    if (value is! List) return null;
    final list = value
        .whereType<String>()
        .map((item) => item.trim())
        .where((item) => item.isNotEmpty)
        .toList(growable: false);
    return list.isEmpty ? null : list;
  }

  final displayName =
      stringValue('displayName') ??
      stringValue('label') ??
      stringValue('name') ??
      stringValue('entityId') ??
      stringValue('userId') ??
      stringValue('id');

  if (displayName == null) return null;

  return TipTapMention(
    userId: stringValue('userId'),
    entityId: stringValue('entityId'),
    entityType: stringValue('entityType'),
    displayName: displayName,
    avatarUrl: stringValue('avatarUrl'),
    subtitle: stringValue('subtitle'),
    priority: stringValue('priority'),
    listColor: stringValue('listColor'),
    assignees: stringList('assignees'),
  );
}
