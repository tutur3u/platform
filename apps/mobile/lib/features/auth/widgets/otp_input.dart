import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// A 6-digit OTP input field.
class OtpInput extends StatelessWidget {
  const OtpInput({
    required this.controller,
    this.onCompleted,
    super.key,
  });

  final TextEditingController controller;
  final ValueChanged<String>? onCompleted;

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      decoration: InputDecoration(
        labelText: 'OTP',
        hintText: '000000',
        border: const OutlineInputBorder(),
        counterText: '',
      ),
      keyboardType: TextInputType.number,
      textAlign: TextAlign.center,
      maxLength: 6,
      inputFormatters: [FilteringTextInputFormatter.digitsOnly],
      style: Theme.of(context).textTheme.headlineSmall?.copyWith(
            letterSpacing: 8,
          ),
      onChanged: (value) {
        if (value.length == 6) onCompleted?.call(value);
      },
    );
  }
}
