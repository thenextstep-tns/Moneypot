import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  Animated,
  Easing,
  StyleSheet,
} from 'react-native';
import { theme } from '../theme';
import { money } from '../domain/schedule';
import { triggerHaptic } from '../utils/haptics';
import type { QuickTemplate } from '../domain/types';

interface QuickLogButtonProps {
  template: QuickTemplate;
  onSuccess: (template: QuickTemplate) => void;
  currencyDefault?: string;
}

export function QuickLogButton({
  template,
  onSuccess,
  currencyDefault,
}: QuickLogButtonProps) {
  const [isHolding, setIsHolding] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const fillAnim = useRef(new Animated.Value(0)).current;
  const blinkAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completedRef = useRef(false);

  const handlePressIn = () => {
    if (isSuccess || completedRef.current) return;
    completedRef.current = false;
    setIsHolding(true);
    triggerHaptic('light');

    // Tactile depression scale while holding
    Animated.spring(scaleAnim, {
      toValue: 0.96,
      useNativeDriver: true,
    }).start();

    // Fill with green within 1 second
    fillAnim.setValue(0);
    Animated.timing(fillAnim, {
      toValue: 1,
      duration: 1000,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start();

    // Hold timer for 1000ms
    holdTimerRef.current = setTimeout(() => {
      completedRef.current = true;
      handleSuccess();
    }, 1000);
  };

  const handlePressOut = () => {
    if (completedRef.current) return;

    // Tap released before 1 second -> nothing happens
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }

    // Restore scale
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
    }).start();

    // Cancel and smoothly drain progress back to 0
    Animated.timing(fillAnim, {
      toValue: 0,
      duration: 180,
      useNativeDriver: false,
    }).start(() => {
      setIsHolding(false);
    });
  };

  const handleSuccess = () => {
    setIsSuccess(true);
    triggerHaptic('success');
    onSuccess(template);

    // Success blink and scale pop animation
    Animated.parallel([
      Animated.sequence([
        Animated.timing(scaleAnim, {
          toValue: 1.07,
          duration: 110,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 4,
          tension: 40,
          useNativeDriver: true,
        }),
      ]),
      // Rapid double flash blink
      Animated.sequence([
        Animated.timing(blinkAnim, {
          toValue: 0.85,
          duration: 70,
          useNativeDriver: true,
        }),
        Animated.timing(blinkAnim, {
          toValue: 0.1,
          duration: 70,
          useNativeDriver: true,
        }),
        Animated.timing(blinkAnim, {
          toValue: 0.65,
          duration: 70,
          useNativeDriver: true,
        }),
        Animated.timing(blinkAnim, {
          toValue: 0,
          duration: 100,
          useNativeDriver: true,
        }),
      ]),
    ]).start();

    // Keep success indication for 1.8 seconds, then reset
    setTimeout(() => {
      Animated.timing(fillAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: false,
      }).start(() => {
        setIsSuccess(false);
        setIsHolding(false);
        completedRef.current = false;
      });
    }, 1800);
  };

  const fillWidth = fillAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  const nameColor = isHolding
    ? fillAnim.interpolate({
        inputRange: [0, 0.45, 1],
        outputRange: [theme.colors.ink, theme.colors.ink, '#FFFFFF'],
      })
    : theme.colors.ink;

  const amountColor = isHolding
    ? fillAnim.interpolate({
        inputRange: [0, 0.45, 1],
        outputRange: [theme.colors.mute, theme.colors.mute, '#F0FDF4'],
      })
    : theme.colors.mute;

  return (
    <Animated.View
      style={[
        styles.outerContainer,
        {
          transform: [{ scale: scaleAnim }],
          borderColor: isSuccess ? '#16A34A' : isHolding ? '#22C55E' : theme.colors.line,
        },
      ]}
    >
      <Pressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={styles.pressable}
      >
        {/* Animated green progress fill */}
        <Animated.View
          style={[
            styles.fillBar,
            {
              width: isSuccess ? '100%' : fillWidth,
              backgroundColor: isSuccess ? '#166534' : '#22C55E',
            },
          ]}
        />

        {/* Success blink / flash overlay */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.blinkOverlay,
            {
              opacity: blinkAnim,
            },
          ]}
        />

        {/* Content */}
        {isSuccess ? (
          <View style={styles.contentRow}>
            <Text style={styles.successEmoji}>✓</Text>
            <View>
              <Text style={styles.successName}>Added!</Text>
              <Text style={styles.successAmount}>
                +{money(template.amount, template.currency || currencyDefault)}
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.contentRow}>
            <Text style={styles.templateEmoji}>{template.emoji || '⚡'}</Text>
            <View>
              <Animated.Text style={[styles.templateName, { color: nameColor }]}>
                {template.name}
              </Animated.Text>
              <Animated.Text style={[styles.templateAmount, { color: amountColor }]}>
                {money(template.amount, template.currency || currencyDefault)}
              </Animated.Text>
            </View>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    borderRadius: theme.radius.full,
    borderWidth: 1.5,
    backgroundColor: theme.colors.card,
    overflow: 'hidden',
    minWidth: 125,
    ...theme.shadowCard,
  },
  pressable: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fillBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: theme.radius.full,
  },
  blinkOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#FFFFFF',
    zIndex: 10,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    zIndex: 2,
  },
  templateEmoji: {
    fontSize: 18,
  },
  templateName: {
    fontSize: 12,
    fontWeight: '700',
  },
  templateAmount: {
    fontSize: 11,
    fontWeight: '600',
  },
  successEmoji: {
    fontSize: 18,
    color: '#FFFFFF',
    fontWeight: '900',
  },
  successName: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  successAmount: {
    fontSize: 11,
    fontWeight: '700',
    color: '#DCFCE7',
  },
});
