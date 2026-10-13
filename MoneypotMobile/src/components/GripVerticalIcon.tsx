import React from 'react';
import Svg, { Circle } from 'react-native-svg';

interface GripVerticalIconProps {
  size?: number;
  color?: string;
}

export function GripVerticalIcon({ size = 16, color = '#9CA3AF' }: GripVerticalIconProps) {
  const width = Math.round(size * 0.625);
  return (
    <Svg width={width} height={size} viewBox="0 0 10 16" fill={color}>
      <Circle cx="2.5" cy="2.5" r="1.5" />
      <Circle cx="7.5" cy="2.5" r="1.5" />
      <Circle cx="2.5" cy="8" r="1.5" />
      <Circle cx="7.5" cy="8" r="1.5" />
      <Circle cx="2.5" cy="13.5" r="1.5" />
      <Circle cx="7.5" cy="13.5" r="1.5" />
    </Svg>
  );
}
