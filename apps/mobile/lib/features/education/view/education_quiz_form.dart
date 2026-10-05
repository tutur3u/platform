part of 'education_page.dart';

class _QuizSheet extends StatefulWidget {
  const _QuizSheet({
    required this.title,
    required this.onSubmit,
    this.initialQuiz,
  });

  final String title;
  final EducationQuiz? initialQuiz;
  final Future<void> Function(
    String question,
    List<Map<String, dynamic>> options,
  )
  onSubmit;

  @override
  State<_QuizSheet> createState() => _QuizSheetState();
}

class _QuizSheetState extends State<_QuizSheet> {
  late final TextEditingController _questionController;
  late List<_QuizOptionDraft> _options;
  bool _submitting = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _questionController = TextEditingController(
      text: widget.initialQuiz?.question,
    );
    _options = (widget.initialQuiz?.options ?? const <EducationQuizOption>[])
        .map(_QuizOptionDraft.fromOption)
        .toList(growable: true);
    if (_options.length < 2) {
      _options = [
        _QuizOptionDraft.empty(correct: true),
        _QuizOptionDraft.empty(),
      ];
    }
  }

  @override
  void dispose() {
    _questionController.dispose();
    for (final option in _options) {
      option.dispose();
    }
    super.dispose();
  }

  Future<void> _submit() async {
    final question = _questionController.text.trim();
    if (question.isEmpty) return;
    final cleanedOptions = _options
        .map(
          (option) => {
            if (option.id?.isNotEmpty ?? false) 'id': option.id,
            'value': option.controller.text.trim(),
            'is_correct': option.isCorrect,
            'explanation': option.explanationController.text.trim().isEmpty
                ? null
                : option.explanationController.text.trim(),
          },
        )
        .where((option) => option['value']?.toString().isNotEmpty ?? false)
        .toList(growable: false);

    if (cleanedOptions.length < 2 ||
        !cleanedOptions.any((option) => option['is_correct'] == true)) {
      return;
    }

    setState(() => _submitting = true);
    try {
      await widget.onSubmit(question, cleanedOptions);
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } on Object catch (error) {
      if (mounted) {
        setState(
          () => _error = error is ApiException
              ? error.message
              : context.l10n.commonSomethingWentWrong,
        );
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        top: 16,
        bottom: 16 + MediaQuery.viewInsetsOf(context).bottom,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            widget.title,
            style: shad.Theme.of(
              context,
            ).typography.large.copyWith(fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 16),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Text(
                _error!,
                style: TextStyle(
                  color: shad.Theme.of(context).colorScheme.destructive,
                ),
              ),
            ),
          TextField(
            controller: _questionController,
            minLines: 2,
            maxLines: 4,
            decoration: InputDecoration(
              labelText: context.l10n.educationQuizQuestionLabel,
            ),
          ),
          const SizedBox(height: 12),
          ...List.generate(_options.length, (index) {
            final option = _options[index];
            return Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: FinancePanel(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            context.l10n.educationQuizOptionLabel(index + 1),
                            style: shad.Theme.of(context).typography.small
                                .copyWith(fontWeight: FontWeight.w700),
                          ),
                        ),
                        Switch(
                          value: option.isCorrect,
                          onChanged: (value) {
                            setState(() => option.isCorrect = value);
                          },
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    TextField(
                      controller: option.controller,
                      decoration: InputDecoration(
                        labelText: context.l10n.educationQuizOptionValueLabel,
                      ),
                    ),
                    const SizedBox(height: 8),
                    TextField(
                      controller: option.explanationController,
                      decoration: InputDecoration(
                        labelText:
                            context.l10n.educationQuizOptionExplanationLabel,
                      ),
                    ),
                    if (_options.length > 2)
                      Align(
                        alignment: Alignment.centerRight,
                        child: TextButton(
                          onPressed: () {
                            setState(() {
                              _options.removeAt(index).dispose();
                            });
                          },
                          child: Text(context.l10n.commonDelete),
                        ),
                      ),
                  ],
                ),
              ),
            );
          }),
          TextButton.icon(
            onPressed: () {
              setState(() => _options.add(_QuizOptionDraft.empty()));
            },
            icon: const Icon(Icons.add_rounded),
            label: Text(context.l10n.educationAddOption),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: TextButton(
                  onPressed: _submitting
                      ? null
                      : () => Navigator.of(context).pop(false),
                  child: Text(context.l10n.commonCancel),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: FilledButton(
                  onPressed: _submitting ? null : _submit,
                  child: Text(context.l10n.commonSave),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
