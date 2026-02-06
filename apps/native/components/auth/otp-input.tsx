import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet } from 'react-native';
import OTPTextInput from 'react-native-otp-textinput';

import { useColorScheme } from '@/hooks/use-color-scheme';

type OtpInputProps = {
  value: string;
  onChange: (value: string) => void;
  isDisabled?: boolean;
};

export function OtpInput({ value, onChange, isDisabled }: OtpInputProps) {
  const colorScheme = useColorScheme();
  const inputRef = useRef<OTPTextInput>(null);

  useEffect(() => {
    if (!value) {
      inputRef.current?.clear();
    }
  }, [value]);

  const styles = useMemo(() => {
    const isDark = colorScheme === 'dark';
    const borderColor = isDark ? '#3f3f46' : '#d4d4d8';
    const backgroundColor = isDark ? '#27272a' : '#f4f4f5';
    const textColor = isDark ? '#ffffff' : '#18181b';

    return StyleSheet.create({
      container: {
        justifyContent: 'space-between',
      },
      input: {
        width: 44,
        height: 52,
        borderRadius: 10,
        borderWidth: 1,
        borderColor,
        backgroundColor,
        color: textColor,
        fontSize: 20,
        fontWeight: '600',
      },
    });
  }, [colorScheme]);

  return (
    <OTPTextInput
      ref={inputRef}
      inputCount={6}
      autoFocus={false}
      tintColor={colorScheme === 'dark' ? '#60a5fa' : '#2563eb'}
      offTintColor={colorScheme === 'dark' ? '#3f3f46' : '#d4d4d8'}
      keyboardType="numeric"
      handleTextChange={onChange}
      disabled={isDisabled}
      containerStyle={styles.container}
      textInputStyle={styles.input}
    />
  );
}
