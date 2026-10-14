import { Platform, StyleSheet } from 'react-native';
import { useMemo } from 'react';
import { useData } from './context/DataContext';

export interface ThemeColors {
  bg: string;
  card: string;
  cardMuted: string;
  ink: string;
  inkSecondary: string;
  mute: string;
  line: string;
  lineLight: string;
  brand: string;
  brandLight: string;
  brandDark: string;
  bad: string;
  badLight: string;
  warning: string;
  warningLight: string;
  warningText: string;
  blue: string;
  blueLight: string;
  purple: string;
  purpleLight: string;
  accent: string;
  overlay: string;
  tagInstantBg: string;
  tagInstantInk: string;
  tagInstantBorder: string;
  tagSharedBg: string;
  tagSharedInk: string;
  tagSharedBorder: string;
  btnTransferBg: string;
  btnTransferInk: string;
  btnTransferBorder: string;
  chipBg: string;
  chipBorder: string;
}

export const lightColors: ThemeColors = {
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
  brandDark: '#166534',
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
  overlay: 'rgba(0, 0, 0, 0.45)',
  tagInstantBg: '#ECFDF5',
  tagInstantInk: '#065F46',
  tagInstantBorder: '#A7F3D0',
  tagSharedBg: '#F3E8FF',
  tagSharedInk: '#6B21A8',
  tagSharedBorder: '#E9D5FF',
  btnTransferBg: '#F8FAFC',
  btnTransferInk: '#475569',
  btnTransferBorder: '#E2E8F0',
  chipBg: '#FFFFFF',
  chipBorder: '#CBD5E1',
};

export const darkColors: ThemeColors = {
  bg: '#0F1216',
  card: '#181C21',
  cardMuted: '#1E232B',
  ink: '#F1F4F7',
  inkSecondary: '#CBD5E1',
  mute: '#8E98A4',
  line: '#262B33',
  lineLight: '#1F242B',
  brand: '#34C759',
  brandLight: '#113429',
  brandDark: '#4ADE80',
  bad: '#F87171',
  badLight: '#3B1C1F',
  warning: '#FBBF24',
  warningLight: '#2D2312',
  warningText: '#FCD34D',
  blue: '#60A5FA',
  blueLight: '#12283A',
  purple: '#C084FC',
  purpleLight: '#2B1D3D',
  accent: '#60A5FA',
  overlay: 'rgba(0, 0, 0, 0.7)',
  tagInstantBg: '#113429',
  tagInstantInk: '#5EEAD4',
  tagInstantBorder: '#1A5342',
  tagSharedBg: '#2B1D3D',
  tagSharedInk: '#D8B4FE',
  tagSharedBorder: '#442D61',
  btnTransferBg: '#1E232B',
  btnTransferInk: '#94A3B8',
  btnTransferBorder: '#2D3440',
  chipBg: '#181C21',
  chipBorder: '#2D3440',
};

const radius = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  full: 999,
};

export const lightTheme = {
  isDark: false,
  colors: lightColors,
  radius,
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

export const darkTheme = {
  isDark: true,
  colors: darkColors,
  radius,
  shadow: Platform.select({
    ios: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.35,
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
      shadowOpacity: 0.45,
      shadowRadius: 12,
    },
    android: {
      elevation: 3,
    },
    default: {},
  }),
};

export type Theme = typeof lightTheme;

export const theme = lightTheme;

export function useTheme() {
  const { isDark, themeMode } = useData();
  const activeTheme = isDark ? darkTheme : lightTheme;
  return {
    theme: activeTheme,
    colors: activeTheme.colors,
    isDark,
    themeMode,
  };
}

export function useStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (theme: Theme) => T
): T {
  const { isDark } = useData();
  const activeTheme = isDark ? darkTheme : lightTheme;
  return useMemo(() => factory(activeTheme), [isDark]);
}
