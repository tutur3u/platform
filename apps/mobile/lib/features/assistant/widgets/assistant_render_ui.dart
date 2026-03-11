// Assistant feature parity module: the generic render_ui catalog renderer is
// intentionally broad, so some style lints are deferred here.
// ignore_for_file: always_use_package_imports, lines_longer_than_80_chars, deprecated_member_use, always_put_required_named_parameters_first, unnecessary_raw_strings, avoid_redundant_argument_values, prefer_const_constructors

import 'dart:convert';
import 'dart:math' as math;

import 'package:equatable/equatable.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart' hide Badge;
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:intl/intl.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/data/repositories/time_tracker_repository.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

import '../models/assistant_models.dart';

typedef AssistantSubmitText = Future<void> Function(String text);
typedef AssistantWorkspaceContextResolver = String Function();

class AssistantRenderUi extends StatefulWidget {
  const AssistantRenderUi({
    required this.output,
    required this.wsId,
    required this.submitText,
    required this.financeRepository,
    required this.timeTrackerRepository,
    required this.tasksInsight,
    super.key,
  });

  final dynamic output;
  final String wsId;
  final AssistantSubmitText submitText;
  final FinanceRepository financeRepository;
  final TimeTrackerRepository timeTrackerRepository;
  final AssistantTasksInsight tasksInsight;

  @override
  State<AssistantRenderUi> createState() => _AssistantRenderUiState();
}

class _AssistantRenderUiState extends State<AssistantRenderUi> {
  final Map<String, dynamic> _state = <String, dynamic>{};

  @override
  Widget build(BuildContext context) {
    final spec = _resolveRenderUiSpec(widget.output);
    if (spec == null) {
      return _buildErrorCard(context, 'Malformed render_ui output');
    }

    final root = spec['root'];
    final elements = spec['elements'];
    if (root is! String || elements is! Map<String, dynamic>) {
      return _buildErrorCard(context, 'Invalid render_ui schema');
    }

    return _buildElement(context, root, elements);
  }

  Widget _buildElement(
    BuildContext context,
    String elementId,
    Map<String, dynamic> elements,
  ) {
    final element = elements[elementId];
    if (element is! Map<String, dynamic>) {
      return _buildErrorCard(context, 'Missing element "$elementId"');
    }

    final type = element['type'] as String?;
    final props = (element['props'] as Map<String, dynamic>?) ?? const {};
    final bindings = (element['bindings'] as Map<String, dynamic>?) ?? const {};
    final childIds = (element['children'] as List<dynamic>? ?? const [])
        .whereType<String>()
        .toList();
    final children = childIds
        .map((id) => _buildElement(context, id, elements))
        .toList();

    switch (type) {
      case 'Card':
        return _sectionCard(
          context,
          title: props['title'] as String?,
          description: props['description'] as String?,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: _withGap(children),
          ),
        );
      case 'Stack':
        final horizontal = props['direction'] == 'horizontal';
        final gap = _num(props['gap'])?.toDouble() ?? 12;
        final alignedChildren = _withGap(children, gap: gap);
        return horizontal
            ? Wrap(
                spacing: gap,
                runSpacing: gap,
                children: alignedChildren,
              )
            : Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: alignedChildren,
              );
      case 'Grid':
        final cols = (_num(props['cols'])?.toInt() ?? 1).clamp(1, 4);
        final gap = _num(props['gap'])?.toDouble() ?? 12;
        return GridView.count(
          crossAxisCount: cols,
          crossAxisSpacing: gap,
          mainAxisSpacing: gap,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          childAspectRatio: cols == 1 ? 4 : 1.2,
          children: children,
        );
      case 'Text':
        return _textWidget(context, props);
      case 'Icon':
        return Icon(
          _resolveIcon(props['name'] as String?),
          size: _num(props['size'])?.toDouble() ?? 18,
          color: _resolveColor(context, props['color'] as String?),
        );
      case 'Badge':
        return _badge(
          context,
          props['label'] as String? ?? '',
          variant: props['variant'] as String?,
        );
      case 'Avatar':
        return CircleAvatar(
          radius: (_num(props['size'])?.toDouble() ?? 32) / 2,
          backgroundImage: (props['src'] as String?)?.isNotEmpty == true
              ? NetworkImage(props['src'] as String)
              : null,
          child: Text((props['fallback'] as String? ?? '?').trim()),
        );
      case 'Separator':
        return Divider(
          height: 24,
          color: Theme.of(context).dividerColor,
        );
      case 'Callout':
        return _buildCallout(
          context,
          title: props['title'] as String?,
          content:
              props['content'] as String? ?? props['text'] as String? ?? '',
          variant: props['variant'] as String?,
        );
      case 'ListItem':
        return _sectionCard(
          context,
          padding: const EdgeInsets.all(12),
          child: ListTile(
            dense: true,
            contentPadding: EdgeInsets.zero,
            leading: Icon(_resolveIcon(props['icon'] as String?)),
            title: Text(props['title'] as String? ?? ''),
            subtitle: (props['subtitle'] as String?)?.isNotEmpty == true
                ? Text(props['subtitle'] as String)
                : null,
            trailing: (props['trailing'] as String?)?.isNotEmpty == true
                ? Text(props['trailing'] as String)
                : null,
            onTap: (props['action'] as String?)?.isNotEmpty == true
                ? () => _handleUiAction(
                    id: props['action'] as String,
                    label:
                        props['title'] as String? ?? props['action'] as String,
                  )
                : null,
          ),
        );
      case 'Progress':
        final value = (_num(props['value']) ?? 0).toDouble().clamp(0, 100);
        return _sectionCard(
          context,
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if ((props['label'] as String?)?.isNotEmpty == true)
                Text(props['label'] as String),
              const SizedBox(height: 8),
              LinearProgressIndicator(value: value / 100),
              if (props['showValue'] as bool? ?? false) ...[
                const SizedBox(height: 6),
                Text('${value.toStringAsFixed(0)}%'),
              ],
            ],
          ),
        );
      case 'Tabs':
        return _RenderTabs(
          tabs: (props['tabs'] as List<dynamic>? ?? const [])
              .whereType<Map<String, dynamic>>()
              .map(
                (tab) => _RenderTab(
                  id: tab['id'] as String? ?? '',
                  label: tab['label'] as String? ?? '',
                ),
              )
              .where((tab) => tab.id.isNotEmpty)
              .toList(),
          defaultTabId: props['defaultTab'] as String?,
          childrenById: {
            for (final childId in childIds)
              childId: _buildElement(context, childId, elements),
          },
        );
      case 'BarChart':
        final data = (props['data'] as List<dynamic>? ?? const [])
            .whereType<Map<String, dynamic>>()
            .toList();
        return _buildBarChart(context, data);
      case 'ArticleHeader':
        return _sectionCard(
          context,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if ((props['eyebrow'] as String?)?.isNotEmpty == true)
                Text(
                  props['eyebrow'] as String,
                  style: Theme.of(context).textTheme.labelMedium,
                ),
              const SizedBox(height: 4),
              Text(
                props['title'] as String? ?? '',
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              if ((props['subtitle'] as String?)?.isNotEmpty == true) ...[
                const SizedBox(height: 6),
                Text(props['subtitle'] as String),
              ],
            ],
          ),
        );
      case 'InsightSection':
        return _sectionCard(
          context,
          title: props['title'] as String?,
          description: props['summary'] as String?,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: _withGap(children),
          ),
        );
      case 'KeyPoints':
        final points = (props['points'] as List<dynamic>? ?? const [])
            .map((point) => point.toString())
            .toList();
        final ordered = props['ordered'] as bool? ?? false;
        return _sectionCard(
          context,
          title: props['title'] as String?,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              for (var i = 0; i < points.length; i++)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Text(
                    ordered ? '${i + 1}. ${points[i]}' : '• ${points[i]}',
                  ),
                ),
            ],
          ),
        );
      case 'SourceList':
        final sources = (props['sources'] as List<dynamic>? ?? const [])
            .whereType<Map<String, dynamic>>()
            .toList();
        return _sectionCard(
          context,
          title: props['title'] as String?,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              for (final source in sources)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(source['title'] as String? ?? ''),
                      if ((source['publisher'] as String?)?.isNotEmpty == true)
                        Text(
                          source['publisher'] as String,
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                      if ((source['url'] as String?)?.isNotEmpty == true)
                        SelectableText(
                          source['url'] as String,
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                    ],
                  ),
                ),
            ],
          ),
        );
      case 'Stat':
        return _sectionCard(
          context,
          padding: const EdgeInsets.all(12),
          child: Row(
            children: [
              Icon(_resolveIcon(props['icon'] as String?)),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(props['label'] as String? ?? ''),
                    Text(
                      props['value'] as String? ?? '',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                  ],
                ),
              ),
            ],
          ),
        );
      case 'Metric':
        return _sectionCard(
          context,
          title: props['title'] as String?,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                props['value'] as String? ?? '',
                style: Theme.of(context).textTheme.headlineMedium,
              ),
              if ((props['trendValue'] as String?)?.isNotEmpty == true)
                Text(
                  '${props['trend'] ?? 'neutral'} ${props['trendValue']}',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
            ],
          ),
        );
      case 'MyTasks':
        return _buildMyTasks(context);
      case 'TimeTrackingStats':
        return _TimeTrackingStatsCard(
          wsId: widget.wsId,
          repository: widget.timeTrackerRepository,
          props: props,
        );
      case 'Form':
        return _buildForm(context, props, bindings, children);
      case 'Input':
        return _buildInput(context, props, bindings);
      case 'FileAttachmentInput':
        return _buildFileInput(context, props, bindings);
      case 'Textarea':
        return _buildTextarea(context, props, bindings);
      case 'Checkbox':
        return _buildCheckbox(context, props, bindings);
      case 'CheckboxGroup':
        return _buildCheckboxGroup(context, props, bindings);
      case 'RadioGroup':
        return _buildRadioGroup(context, props, bindings);
      case 'Select':
        return _buildSelect(context, props, bindings);
      case 'Button':
        return _buildButton(context, props);
      case 'Flashcard':
        return _buildFlashcard(context, props);
      case 'MultiFlashcard':
        return _buildMultiFlashcard(context, props);
      case 'Quiz':
        return _buildQuiz(context, props);
      case 'MultiQuiz':
        return _buildMultiQuiz(context, props);
      default:
        return _buildErrorCard(
          context,
          'Unsupported render_ui component: ${type ?? 'unknown'}',
        );
    }
  }

  Widget _buildMyTasks(BuildContext context) {
    final allTasks = [
      ...widget.tasksInsight.overdue,
      ...widget.tasksInsight.today,
      ...widget.tasksInsight.upcoming,
    ];

    return _sectionCard(
      context,
      title: 'My Tasks',
      description: '${widget.tasksInsight.total} active tasks',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (final task in allTasks.take(8))
            ListTile(
              dense: true,
              contentPadding: EdgeInsets.zero,
              title: Text(task.name),
              subtitle: Text(
                [
                  if (task.listName != null) task.listName,
                  if (task.boardName != null) task.boardName,
                ].join(' • '),
              ),
              trailing: task.endDate != null
                  ? Text(DateFormat.MMMd().format(task.endDate!.toLocal()))
                  : null,
            ),
        ],
      ),
    );
  }

  Widget _buildForm(
    BuildContext context,
    Map<String, dynamic> props,
    Map<String, dynamic> bindings,
    List<Widget> children,
  ) {
    final onSubmitPath = _bindingPath(
      bindings['onSubmit'] ?? props['onSubmit'],
    );

    return _sectionCard(
      context,
      title: props['title'] as String?,
      description: props['description'] as String?,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ..._withGap(children),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: shad.PrimaryButton(
              onPressed: () async {
                await _handleFormSubmit(
                  context,
                  title: props['title'] as String?,
                  submitAction: props['submitAction'] as String?,
                  submitParams:
                      (props['submitParams'] as Map<String, dynamic>?) ??
                      const {},
                  onSubmitPath: onSubmitPath,
                );
              },
              child: Text(props['submitLabel'] as String? ?? 'Submit'),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildInput(
    BuildContext context,
    Map<String, dynamic> props,
    Map<String, dynamic> bindings,
  ) {
    final key = _fieldKey(props, bindings, 'value');
    final controller = TextEditingController(
      text: (_state[key] ?? props['value'] ?? '').toString(),
    );
    return TextField(
      controller: controller,
      keyboardType: props['type'] == 'number'
          ? const TextInputType.numberWithOptions(decimal: true)
          : TextInputType.text,
      decoration: InputDecoration(
        labelText: props['label'] as String? ?? '',
        hintText: props['placeholder'] as String?,
      ),
      onChanged: (value) => _state[key] = value,
    );
  }

  Widget _buildTextarea(
    BuildContext context,
    Map<String, dynamic> props,
    Map<String, dynamic> bindings,
  ) {
    final key = _fieldKey(props, bindings, 'value');
    final controller = TextEditingController(
      text: (_state[key] ?? props['value'] ?? '').toString(),
    );
    return TextField(
      controller: controller,
      minLines: (props['rows'] as int?) ?? 3,
      maxLines: (props['rows'] as int?) ?? 6,
      decoration: InputDecoration(
        labelText: props['label'] as String? ?? '',
        hintText: props['placeholder'] as String?,
      ),
      onChanged: (value) => _state[key] = value,
    );
  }

  Widget _buildCheckbox(
    BuildContext context,
    Map<String, dynamic> props,
    Map<String, dynamic> bindings,
  ) {
    final key = _fieldKey(props, bindings, 'checked');
    final checked =
        (_state[key] as bool?) ?? (props['checked'] as bool? ?? false);
    return CheckboxListTile(
      value: checked,
      title: Text(props['label'] as String? ?? ''),
      subtitle: (props['description'] as String?)?.isNotEmpty == true
          ? Text(props['description'] as String)
          : null,
      onChanged: (value) => setState(() => _state[key] = value ?? false),
      controlAffinity: ListTileControlAffinity.leading,
      contentPadding: EdgeInsets.zero,
    );
  }

  Widget _buildCheckboxGroup(
    BuildContext context,
    Map<String, dynamic> props,
    Map<String, dynamic> bindings,
  ) {
    final key = _fieldKey(props, bindings, 'values');
    final values =
        ((_state[key] as List<dynamic>?) ??
                props['values'] as List<dynamic>? ??
                const [])
            .map((item) => item.toString())
            .toSet();
    final options = (props['options'] as List<dynamic>? ?? const [])
        .whereType<Map<String, dynamic>>()
        .toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(props['label'] as String? ?? ''),
        const SizedBox(height: 8),
        for (final option in options)
          CheckboxListTile(
            value: values.contains(option['value']),
            title: Text(option['label'] as String? ?? ''),
            onChanged: (checked) {
              final next = {...values};
              if (checked ?? false) {
                next.add((option['value'] ?? '').toString());
              } else {
                next.remove((option['value'] ?? '').toString());
              }
              setState(() => _state[key] = next.toList());
            },
            contentPadding: EdgeInsets.zero,
            controlAffinity: ListTileControlAffinity.leading,
          ),
      ],
    );
  }

  Widget _buildRadioGroup(
    BuildContext context,
    Map<String, dynamic> props,
    Map<String, dynamic> bindings,
  ) {
    final key = _fieldKey(props, bindings, 'value');
    final value = (_state[key] ?? props['value'])?.toString();
    final options = (props['options'] as List<dynamic>? ?? const [])
        .whereType<Map<String, dynamic>>()
        .toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(props['label'] as String? ?? ''),
        const SizedBox(height: 8),
        for (final option in options)
          RadioListTile<String>(
            value: option['value']?.toString() ?? '',
            groupValue: value,
            title: Text(option['label'] as String? ?? ''),
            onChanged: (next) => setState(() => _state[key] = next),
            contentPadding: EdgeInsets.zero,
          ),
      ],
    );
  }

  Widget _buildSelect(
    BuildContext context,
    Map<String, dynamic> props,
    Map<String, dynamic> bindings,
  ) {
    final key = _fieldKey(props, bindings, 'value');
    final value = (_state[key] ?? props['value'])?.toString();
    final options = (props['options'] as List<dynamic>? ?? const [])
        .whereType<Map<String, dynamic>>()
        .toList();

    return DropdownButtonFormField<String>(
      initialValue: value,
      decoration: InputDecoration(
        labelText: props['label'] as String? ?? '',
        hintText: props['placeholder'] as String?,
      ),
      items: options
          .map(
            (option) => DropdownMenuItem<String>(
              value: option['value']?.toString(),
              child: Text(option['label'] as String? ?? ''),
            ),
          )
          .toList(),
      onChanged: (next) => setState(() => _state[key] = next),
    );
  }

  Widget _buildFileInput(
    BuildContext context,
    Map<String, dynamic> props,
    Map<String, dynamic> bindings,
  ) {
    final key = _fieldKey(props, bindings, 'value');
    final selected = ((_state[key] as List<dynamic>?) ?? const [])
        .map((item) => item.toString())
        .toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(props['label'] as String? ?? ''),
        if ((props['description'] as String?)?.isNotEmpty == true)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(
              props['description'] as String,
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ),
        const SizedBox(height: 8),
        shad.SecondaryButton(
          onPressed: () async {
            final result = await FilePicker.platform.pickFiles(
              allowMultiple: true,
              type: FileType.any,
            );
            final paths =
                result?.files
                    .map((file) => file.path)
                    .whereType<String>()
                    .toList() ??
                const <String>[];
            setState(() => _state[key] = paths);
          },
          child: const Text('Choose files'),
        ),
        if (selected.isNotEmpty) ...[
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final path in selected)
                Chip(label: Text(path.split('/').last)),
            ],
          ),
        ],
      ],
    );
  }

  Widget _buildButton(BuildContext context, Map<String, dynamic> props) {
    final action = props['action'] as String?;
    return Align(
      alignment: Alignment.centerLeft,
      child: shad.SecondaryButton(
        onPressed: action == null
            ? null
            : () => _handleUiAction(
                id: action,
                label: props['label'] as String? ?? action,
              ),
        child: Text(props['label'] as String? ?? 'Continue'),
      ),
    );
  }

  Widget _buildFlashcard(BuildContext context, Map<String, dynamic> props) {
    return _FlipCard(
      front: props['front'] as String? ?? '',
      back: props['back'] as String? ?? '',
    );
  }

  Widget _buildMultiFlashcard(
    BuildContext context,
    Map<String, dynamic> props,
  ) {
    final cards = (props['flashcards'] as List<dynamic>? ?? const [])
        .whereType<Map<String, dynamic>>()
        .toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if ((props['title'] as String?)?.isNotEmpty == true)
          Text(
            props['title'] as String,
            style: Theme.of(context).textTheme.titleLarge,
          ),
        const SizedBox(height: 12),
        for (final card in cards)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: _FlipCard(
              front: card['front'] as String? ?? '',
              back: card['back'] as String? ?? '',
            ),
          ),
      ],
    );
  }

  Widget _buildQuiz(BuildContext context, Map<String, dynamic> props) {
    return _QuizCard(
      question: props['question'] as String? ?? '',
      options: (props['options'] as List<dynamic>? ?? const [])
          .map((item) => item.toString())
          .toList(),
      answer: (props['correctAnswer'] ?? props['answer'])?.toString(),
      explanation: props['explanation'] as String?,
    );
  }

  Widget _buildMultiQuiz(BuildContext context, Map<String, dynamic> props) {
    final quizzes = (props['quizzes'] as List<dynamic>? ?? const [])
        .whereType<Map<String, dynamic>>()
        .toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if ((props['title'] as String?)?.isNotEmpty == true)
          Text(
            props['title'] as String,
            style: Theme.of(context).textTheme.titleLarge,
          ),
        const SizedBox(height: 12),
        for (final quiz in quizzes)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: _QuizCard(
              question: quiz['question'] as String? ?? '',
              options: (quiz['options'] as List<dynamic>? ?? const [])
                  .map((item) => item.toString())
                  .toList(),
              answer: (quiz['correctAnswer'] ?? quiz['answer'])?.toString(),
              explanation: quiz['explanation'] as String?,
            ),
          ),
      ],
    );
  }

  Future<void> _handleFormSubmit(
    BuildContext context, {
    required String? title,
    required String? submitAction,
    required Map<String, dynamic> submitParams,
    required String? onSubmitPath,
  }) async {
    final values = Map<String, dynamic>.from(_state);
    final actionName =
        _shouldUseTimeTrackingRequestAction(
          submitAction,
          values,
          submitParams,
        )
        ? 'create_time_tracking_request'
        : (submitAction ?? 'submit_form');

    try {
      if (actionName == 'submit_form') {
        await widget.submitText(
          _buildFormSubmissionMessage(title: title, values: values),
        );
      } else if (actionName == '__ui_action__') {
        await _handleUiAction(
          id: submitParams['id']?.toString() ?? '',
          label: submitParams['label']?.toString() ?? 'Continue',
        );
      } else if (actionName == 'log_transaction') {
        await _createTransaction({...submitParams, ...values});
      } else if (actionName == 'create_time_tracking_request') {
        await _createTimeTrackingRequest({...submitParams, ...values});
      } else if (onSubmitPath != null && onSubmitPath.isNotEmpty) {
        await widget.submitText(
          _buildFormSubmissionMessage(title: title, values: values),
        );
      }

      if (!context.mounted) return;
      shad.showToast(
        context: context,
        builder: (context, overlay) => shad.Alert(
          content: const Text('Submitted successfully'),
        ),
      );
    } on Exception catch (error) {
      if (!context.mounted) return;
      shad.showToast(
        context: context,
        builder: (context, overlay) => shad.Alert.destructive(
          content: Text(error.toString()),
        ),
      );
    }
  }

  Future<void> _handleUiAction({
    required String id,
    required String label,
  }) async {
    await widget.submitText(
      '### UI Action\n\n**Action**: ${id.trim().isEmpty ? label : id}\n**Source**: ui',
    );
  }

  Future<void> _createTransaction(Map<String, dynamic> params) async {
    final amount = _num(params['amount'])?.toDouble();
    final walletId = params['walletId']?.toString();
    if (amount == null || walletId == null || walletId.isEmpty) {
      throw Exception('Invalid transaction payload');
    }

    await widget.financeRepository.createTransaction(
      wsId: widget.wsId,
      amount: amount,
      takenAt: DateTime.now(),
      walletId: walletId,
      description: params['description']?.toString(),
      categoryId: params['categoryId']?.toString(),
    );

    await widget.submitText(
      '### Transaction Logged\n\n**Amount**: $amount\n**Description**: ${params['description'] ?? 'N/A'}',
    );
  }

  Future<void> _createTimeTrackingRequest(Map<String, dynamic> params) async {
    final title = params['title']?.toString().trim();
    final startTime = _parseDateTimeInput(params['startTime']);
    final endTime = _parseDateTimeInput(params['endTime']);
    final attachments = [
      ..._collectFilePaths(params['evidence']),
      ..._collectFilePaths(params['attachments']),
    ];
    if (title == null || title.isEmpty) {
      throw Exception('Title is required');
    }
    if (startTime == null || endTime == null) {
      throw Exception('Start and end time are required');
    }

    await widget.timeTrackerRepository.createRequest(
      widget.wsId,
      title: title,
      description: params['description']?.toString(),
      categoryId: params['categoryId']?.toString(),
      startTime: startTime,
      endTime: endTime,
      imageLocalPaths: attachments,
    );

    await widget.submitText(
      _buildFormSubmissionMessage(title: title, values: params),
    );
  }

  Widget _sectionCard(
    BuildContext context, {
    String? title,
    String? description,
    required Widget child,
    EdgeInsets padding = const EdgeInsets.all(16),
  }) {
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: padding,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (title != null && title.isNotEmpty) ...[
              Text(title, style: Theme.of(context).textTheme.titleMedium),
              if (description != null && description.isNotEmpty) ...[
                const SizedBox(height: 4),
                Text(
                  description,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
              const SizedBox(height: 12),
            ],
            child,
          ],
        ),
      ),
    );
  }

  Widget _buildErrorCard(BuildContext context, String message) {
    return _buildCallout(
      context,
      title: 'Render UI Error',
      content: message,
      variant: 'error',
    );
  }

  Widget _buildCallout(
    BuildContext context, {
    required String content,
    String? title,
    String? variant,
  }) {
    final color = switch (variant) {
      'success' => Colors.green,
      'warning' => Colors.orange,
      'error' => Colors.red,
      _ => Colors.blue,
    };
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (title != null && title.isNotEmpty)
            Text(
              title,
              style: Theme.of(context).textTheme.titleSmall,
            ),
          if (title != null && title.isNotEmpty) const SizedBox(height: 4),
          MarkdownBody(data: content),
        ],
      ),
    );
  }

  Widget _badge(BuildContext context, String label, {String? variant}) {
    final background = switch (variant) {
      'success' => Colors.green.withValues(alpha: 0.12),
      'warning' => Colors.orange.withValues(alpha: 0.12),
      'error' => Colors.red.withValues(alpha: 0.12),
      'outline' => Colors.transparent,
      _ => Theme.of(context).colorScheme.surfaceContainerHighest,
    };

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(
          color: variant == 'outline'
              ? Theme.of(context).dividerColor
              : Colors.transparent,
        ),
      ),
      child: Text(label),
    );
  }

  Widget _buildBarChart(BuildContext context, List<Map<String, dynamic>> data) {
    final maxValue = data
        .map((item) => _num(item['value'])?.toDouble() ?? 0)
        .fold<double>(0, math.max);

    return _sectionCard(
      context,
      child: SizedBox(
        height: 180,
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            for (final item in data)
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.end,
                    children: [
                      Text('${_num(item['value'])?.toInt() ?? 0}'),
                      const SizedBox(height: 8),
                      Container(
                        height: maxValue == 0
                            ? 0
                            : 100 *
                                  ((_num(item['value'])?.toDouble() ?? 0) /
                                      maxValue),
                        decoration: BoxDecoration(
                          color:
                              _resolveColor(
                                context,
                                item['color'] as String?,
                              ) ??
                              Theme.of(context).colorScheme.primary,
                          borderRadius: BorderRadius.circular(10),
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        item['label']?.toString() ?? '',
                        textAlign: TextAlign.center,
                      ),
                    ],
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _textWidget(BuildContext context, Map<String, dynamic> props) {
    final content =
        props['content'] as String? ?? props['text'] as String? ?? '';
    final variant = props['variant'] as String? ?? 'p';

    switch (variant) {
      case 'h1':
        return Text(content, style: Theme.of(context).textTheme.headlineMedium);
      case 'h2':
        return Text(content, style: Theme.of(context).textTheme.headlineSmall);
      case 'h3':
        return Text(content, style: Theme.of(context).textTheme.titleLarge);
      case 'h4':
        return Text(content, style: Theme.of(context).textTheme.titleMedium);
      case 'small':
      case 'tiny':
        return Text(content, style: Theme.of(context).textTheme.bodySmall);
      default:
        return MarkdownBody(data: content);
    }
  }

  List<Widget> _withGap(List<Widget> children, {double gap = 12}) {
    final items = <Widget>[];
    for (var index = 0; index < children.length; index++) {
      items.add(children[index]);
      if (index != children.length - 1) {
        items.add(SizedBox(height: gap));
      }
    }
    return items;
  }

  String _fieldKey(
    Map<String, dynamic> props,
    Map<String, dynamic> bindings,
    String bindingKey,
  ) {
    final boundPath = _bindingPath(bindings[bindingKey]);
    if (boundPath != null) return boundPath;
    final name = props['name']?.toString();
    if (name != null && name.isNotEmpty) return name;
    final label = props['label']?.toString().trim().toLowerCase();
    return (label == null || label.isEmpty)
        ? 'field'
        : label.replaceAll(RegExp(r'[^a-z0-9]+'), '_');
  }

  String? _bindingPath(dynamic value) {
    if (value is String && value.isNotEmpty) {
      return value.replaceFirst('/', '');
    }
    if (value is Map<String, dynamic>) {
      final bound = value[r'$bindState'];
      if (bound is String && bound.isNotEmpty) {
        return bound.replaceFirst('/', '');
      }
    }
    return null;
  }

  num? _num(dynamic value) {
    if (value is num) return value;
    return num.tryParse(value?.toString() ?? '');
  }

  IconData _resolveIcon(String? name) {
    switch (name) {
      case 'Calendar':
        return Icons.calendar_month_outlined;
      case 'Wallet':
        return Icons.account_balance_wallet_outlined;
      case 'Check':
        return Icons.check_circle_outline;
      case 'AlertTriangle':
        return Icons.warning_amber_outlined;
      case 'Clock':
        return Icons.schedule_outlined;
      case 'TrendingUp':
        return Icons.trending_up_outlined;
      case 'TrendingDown':
        return Icons.trending_down_outlined;
      case 'BookOpen':
        return Icons.menu_book_outlined;
      default:
        return Icons.auto_awesome_outlined;
    }
  }

  Color? _resolveColor(BuildContext context, String? value) {
    if (value == null || value.isEmpty) return null;
    if (value.startsWith('#')) {
      final hex = value.replaceFirst('#', '');
      if (hex.length == 6) {
        return Color(int.parse('FF$hex', radix: 16));
      }
    }
    return switch (value) {
      'success' => Colors.green,
      'warning' => Colors.orange,
      'error' => Colors.red,
      'primary' => Theme.of(context).colorScheme.primary,
      _ => null,
    };
  }

  bool _shouldUseTimeTrackingRequestAction(
    String? explicitAction,
    Map<String, dynamic> values,
    Map<String, dynamic> submitParams,
  ) {
    if (explicitAction == 'create_time_tracking_request') return true;
    if (explicitAction != null && explicitAction != 'submit_form') return false;
    final merged = {...submitParams, ...values};
    return merged['startTime'] != null &&
        merged['endTime'] != null &&
        ((merged['title']?.toString().trim().isNotEmpty ?? false) ||
            _collectFilePaths(merged['evidence']).isNotEmpty ||
            _collectFilePaths(merged['attachments']).isNotEmpty);
  }

  DateTime? _parseDateTimeInput(dynamic value) {
    if (value == null) return null;
    return DateTime.tryParse(value.toString());
  }

  List<String> _collectFilePaths(dynamic value) {
    if (value is! List<dynamic>) return const [];
    return value
        .map((item) => item.toString())
        .where((item) => item.isNotEmpty)
        .toList();
  }

  String _buildFormSubmissionMessage({
    required String? title,
    required Map<String, dynamic> values,
  }) {
    final header = (title == null || title.trim().isEmpty)
        ? 'Form Submission'
        : title.trim();
    final entries = values.entries
        .where(
          (entry) =>
              !entry.key.startsWith('__') &&
              !const {
                'submitting',
                'success',
                'error',
                'message',
              }.contains(entry.key),
        )
        .map(
          (entry) =>
              '**${_humanize(entry.key)}**: ${_formatValue(entry.value)}',
        )
        .join('\n');
    return '### $header\n\n${entries.isEmpty ? '**Details**: Submitted via generated form' : entries}';
  }

  String _humanize(String key) {
    final withSpaces = key
        .replaceAll(RegExp(r'[_-]+'), ' ')
        .replaceAllMapped(
          RegExp(r'([a-z0-9])([A-Z])'),
          (match) => '${match.group(1)} ${match.group(2)}',
        )
        .trim();
    if (withSpaces.isEmpty) return key;
    return withSpaces[0].toUpperCase() + withSpaces.substring(1);
  }

  String _formatValue(dynamic value) {
    if (value == null || value == '') return 'N/A';
    if (value is bool) return value ? 'Yes' : 'No';
    if (value is List<dynamic>) {
      if (value.isEmpty) return 'N/A';
      return value.map(_formatValue).join(', ');
    }
    if (value is Map<String, dynamic>) {
      return jsonEncode(value);
    }
    return value.toString();
  }
}

class _TimeTrackingStatsCard extends StatelessWidget {
  const _TimeTrackingStatsCard({
    required this.wsId,
    required this.repository,
    required this.props,
  });

  final String wsId;
  final TimeTrackerRepository repository;
  final Map<String, dynamic> props;

  @override
  Widget build(BuildContext context) {
    final range = _resolveStatsRange(
      props['period']?.toString(),
      props['dateFrom']?.toString(),
      props['dateTo']?.toString(),
    );

    return FutureBuilder(
      future: repository.getPeriodStats(
        wsId,
        dateFrom: range.$1,
        dateTo: range.$2,
      ),
      builder: (context, snapshot) {
        if (!snapshot.hasData) {
          return const Card(
            child: Padding(
              padding: EdgeInsets.all(16),
              child: Center(child: CircularProgressIndicator()),
            ),
          );
        }

        final stats = snapshot.data!;
        return Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Time Tracking Stats',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: 12),
                Text('Total: ${stats.totalDuration} seconds'),
                Text('Sessions: ${stats.sessionCount}'),
                Text('Categories: ${stats.breakdown.length}'),
              ],
            ),
          ),
        );
      },
    );
  }

  (DateTime, DateTime) _resolveStatsRange(
    String? period,
    String? dateFrom,
    String? dateTo,
  ) {
    final now = DateTime.now();
    if (period == 'today') {
      return (
        DateTime(now.year, now.month, now.day),
        DateTime(now.year, now.month, now.day, 23, 59, 59),
      );
    }
    if (period == 'this_week') {
      final start = now.subtract(Duration(days: now.weekday - 1));
      return (
        DateTime(start.year, start.month, start.day),
        DateTime(now.year, now.month, now.day, 23, 59, 59),
      );
    }
    if (period == 'this_month') {
      return (
        DateTime(now.year, now.month),
        DateTime(now.year, now.month, now.day, 23, 59, 59),
      );
    }
    if (period == 'last_30_days') {
      return (now.subtract(const Duration(days: 29)), now);
    }
    if (period == 'custom') {
      final from = DateTime.tryParse(dateFrom ?? '');
      final to = DateTime.tryParse(dateTo ?? '');
      if (from != null && to != null) {
        return (from, to);
      }
    }
    return (now.subtract(const Duration(days: 6)), now);
  }
}

class _RenderTab extends Equatable {
  const _RenderTab({required this.id, required this.label});

  final String id;
  final String label;

  @override
  List<Object?> get props => [id, label];
}

class _RenderTabs extends StatefulWidget {
  const _RenderTabs({
    required this.tabs,
    required this.childrenById,
    this.defaultTabId,
  });

  final List<_RenderTab> tabs;
  final Map<String, Widget> childrenById;
  final String? defaultTabId;

  @override
  State<_RenderTabs> createState() => _RenderTabsState();
}

class _RenderTabsState extends State<_RenderTabs> {
  late String _selectedTabId =
      widget.defaultTabId ??
      (widget.tabs.isNotEmpty ? widget.tabs.first.id : '');

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final tab in widget.tabs)
              ChoiceChip(
                label: Text(tab.label),
                selected: _selectedTabId == tab.id,
                onSelected: (_) => setState(() => _selectedTabId = tab.id),
              ),
          ],
        ),
        const SizedBox(height: 12),
        if (widget.childrenById[_selectedTabId] case final child?) child,
      ],
    );
  }
}

class _FlipCard extends StatefulWidget {
  const _FlipCard({required this.front, required this.back});

  final String front;
  final String back;

  @override
  State<_FlipCard> createState() => _FlipCardState();
}

class _FlipCardState extends State<_FlipCard> {
  bool _showBack = false;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => setState(() => _showBack = !_showBack),
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Text(_showBack ? widget.back : widget.front),
        ),
      ),
    );
  }
}

class _QuizCard extends StatefulWidget {
  const _QuizCard({
    required this.question,
    required this.options,
    required this.answer,
    this.explanation,
  });

  final String question;
  final List<String> options;
  final String? answer;
  final String? explanation;

  @override
  State<_QuizCard> createState() => _QuizCardState();
}

class _QuizCardState extends State<_QuizCard> {
  String? _selected;

  @override
  Widget build(BuildContext context) {
    final isCorrect =
        _selected != null &&
        widget.answer != null &&
        _selected == widget.answer;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              widget.question,
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 12),
            for (final option in widget.options)
              RadioListTile<String>(
                value: option,
                groupValue: _selected,
                title: Text(option),
                onChanged: (value) => setState(() => _selected = value),
                contentPadding: EdgeInsets.zero,
              ),
            if (_selected != null && widget.answer != null) ...[
              Text(isCorrect ? 'Correct' : 'Try again'),
              if (widget.explanation != null) Text(widget.explanation!),
            ],
          ],
        ),
      ),
    );
  }
}

Map<String, dynamic>? _resolveRenderUiSpec(dynamic output) {
  final queue = <dynamic>[output];
  final seen = <Object>{};

  while (queue.isNotEmpty) {
    final current = queue.removeAt(0);
    if (current == null) continue;

    if (current is String) {
      try {
        queue.add(jsonDecode(current));
      } on FormatException {
        continue;
      }
      continue;
    }

    if (current is! Map<String, dynamic>) continue;
    if (seen.contains(current)) continue;
    seen.add(current);

    if (current['root'] is String &&
        current['elements'] is Map<String, dynamic>) {
      return current;
    }

    for (final key in const [
      'spec',
      'output',
      'result',
      'data',
      'payload',
      'json_schema',
      'schema',
      'json',
    ]) {
      final candidate = current[key];
      if (candidate != null) queue.add(candidate);
    }
  }

  return null;
}
