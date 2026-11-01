import React, { forwardRef, useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, TextInput, View } from 'react-native';

export function FloatingLabel({
  label,
  floated,
  style,
  restingTranslateY = 14,
}) {
  const progress = useRef(new Animated.Value(floated ? 1 : 0)).current;

  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: floated ? 1 : 0,
      duration: 160,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [floated, progress]);

  return (
    <Animated.Text
      pointerEvents="none"
      style={[
        styles.label,
        style,
        {
          fontSize: floated ? 12 : 16,
          lineHeight: floated ? 14 : 20,
          color: floated ? '#2563EB' : '#9CA3AF',
          transform: [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [restingTranslateY, 0],
              }),
            },
          ],
        },
      ]}
    >
      {label}
    </Animated.Text>
  );
}

const FloatingLabelInput = forwardRef(function FloatingLabelInput(
  {
    label,
    value,
    onChangeText,
    containerStyle,
    inputStyle,
    labelStyle,
    restingTranslateY = 14,
    onFocus,
    onBlur,
    accessibilityLabel,
    ...textInputProps
  },
  ref
) {
  const [focused, setFocused] = useState(false);
  const floated = focused || (value != null && String(value).length > 0);

  return (
    <View style={[styles.container, containerStyle, focused && styles.focusedContainer]}>
      <FloatingLabel
        label={label}
        floated={floated}
        style={labelStyle}
        restingTranslateY={restingTranslateY}
      />
      <TextInput
        {...textInputProps}
        ref={ref}
        style={[styles.input, inputStyle]}
        value={value}
        onChangeText={onChangeText}
        placeholder=""
        placeholderTextColor="transparent"
        underlineColorAndroid="transparent"
        accessibilityLabel={accessibilityLabel || label}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
      />
    </View>
  );
});

export default FloatingLabelInput;

const styles = StyleSheet.create({
  container: {
    height: 64,
    position: 'relative',
    justifyContent: 'center',
    overflow: 'visible',
  },
  focusedContainer: {
    borderColor: '#2563EB',
  },
  label: {
    position: 'absolute',
    zIndex: 1,
    left: 14,
    top: 8,
    fontWeight: '500',
  },
  input: {
    width: '100%',
    height: '100%',
    paddingHorizontal: 14,
    paddingTop: 20,
    paddingBottom: 4,
    fontSize: 16,
    color: '#111827',
    backgroundColor: 'transparent',
  },
});
