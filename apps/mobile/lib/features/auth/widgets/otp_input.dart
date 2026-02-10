import 'package:flutter/material.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class OtpInput extends StatelessWidget {
  const OtpInput({
    required this.controller,
    this.onCompleted,
    super.key,
  });

  final TextEditingController controller;
  final void Function(String)? onCompleted;

  @override
  Widget build(BuildContext context) {
    return shad.InputOTP(
      onChanged: (value) {
        final otp = value.otpToString();
        controller.text = otp;
        if (value.length == 6) {
          onCompleted?.call(otp);
        }
      },
      children: [
        shad.InputOTPChild.character(allowDigit: true),
        shad.InputOTPChild.character(allowDigit: true),
        shad.InputOTPChild.character(allowDigit: true),
        shad.InputOTPChild.separator,
        shad.InputOTPChild.character(allowDigit: true),
        shad.InputOTPChild.character(allowDigit: true),
        shad.InputOTPChild.character(allowDigit: true),
      ],
    );
  }
}
