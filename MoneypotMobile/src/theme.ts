import { Platform } from 'react-native';

export const theme = {
  colors: {
    bg: '#F6F4EF',
    card: '#FFFFFF',
    cardMuted: '#F9F8F5',
    ink: '#1F2328',
    inkSecondary: '#4B5563',
    mute: '#6B7280',
    line: '#ECE8E0',
    lineLight: '#F3EFE6',
    brand: '#2FA36B',
    brandLight: '#EEF6F1',
    brandDark: '#1B5E3D',
    bad: '#E5484D',
    badLight: '#FDF2F2',
    warning: '#D97706',
    warningLight: '#FFF8E6',
    warningText: '#6B5B2E',
    blue: '#2563EB',
    blueLight: '#EFF6FF',
    purple: '#7C3AED',
    purpleLight: '#F5F3FF',
    accent: '#3B82F6',
  },
  radius: {
    xs: 6,
    sm: 10,
    md: 14,
    lg: 18,
    xl: 24,
    full: 999,
  },
  shadow: Platform.select({
    ios: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 8,
    },
    android: {
      elevation: 2,
    },
    default: {},
  }),
  shadowCard: Platform.select({
    ios: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.07,
      shadowRadius: 12,
    },
    android: {
      elevation: 3,
    },
    default: {},
  }),
};
