import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View, Pressable, Platform } from 'react-native';

export default function FloatingTextInput({
  label,
  value,
  onChangeText,
  keyboardType,
  autoCapitalize,
  autoCorrect,
  maxLength,
  multiline,
  style,
  inputStyle,
  height,
  editable,
  onBlur,
  onClickOverlay,
  isEditingOverlay,
  accessibilityLabel,
  ...props
}) {
  const [focused, setFocused] = useState(false);
  const hasContent = value && String(value).length > 0;
  const isFloating = focused || hasContent;
  const computedHeight = height || (multiline ? 100 : 60);

  return (
    <View
      style={[
        styles.field,
        { height: computedHeight },
        isFloating && styles.fieldActive,
        focused && styles.fieldFocused,
        style,
      ]}
    >
      <Text style={[styles.label, isFloating && styles.labelFloating]} numberOfLines={1}>
        {label}
      </Text>
      <View style={{ flex: 1, position: 'relative' }}>
        <TextInput
          style={[
            styles.input,
            multiline && styles.multilineInput,
            inputStyle,
          ]}
          value={value}
          onChangeText={onChangeText}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            onBlur?.();
          }}
          keyboardType={keyboardType || 'default'}
          autoCapitalize={autoCapitalize || 'sentences'}
          autoCorrect={autoCorrect ?? true}
          maxLength={maxLength}
          multiline={multiline}
          editable={editable ?? true}
          scrollEnabled={true}
          onScroll={(e) => {
            // Impedisce la propagazione del touch scroll al genitore su iOS/Android se necessario
            e.stopPropagation?.();
          }}
          placeholder=""
          placeholderTextColor="transparent"
          {...props}
        />
        {isEditingOverlay && (
          <Pressable
            style={styles.overlayPressable}
            onPress={onClickOverlay}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    position: 'relative',
    justifyContent: 'flex-end',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
    marginBottom: 16,
  },
  fieldActive: {
    borderColor: '#D1D5DB',
  },
  fieldFocused: {
    borderColor: '#2563EB',
    backgroundColor: '#FFFFFF',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  label: {
    position: 'absolute',
    left: 16,
    top: 18,
    color: '#9CA3AF',
    fontSize: 16,
    fontWeight: '400',
    zIndex: 2,
  },
  labelFloating: {
    top: 8,
    fontSize: 11,
    fontWeight: '700',
    color: '#2563EB',
    letterSpacing: 0.3,
  },
  input: {
    flex: 1,
    color: '#111827',
    fontSize: 16,
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 16 : 14,
    paddingBottom: 6,
  },
  multilineInput: {
    textAlignVertical: 'top',
    paddingTop: Platform.OS === 'ios' ? 26 : 24,
    paddingBottom: 12,
  },
  overlayPressable: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
});
