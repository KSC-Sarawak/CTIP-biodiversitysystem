// apps/mobile/components/bits/charts.js
// Sparkline chart for sensor readings.
import React from 'react';
import Svg, { Line, Polyline } from 'react-native-svg';
import { useTheme } from '../Theme.js';
import { Txt } from './text.js';

// Line chart for sensor readings with a dashed limit line.
export function Spark({ values = [], limit, height = 64 }) {
  const { c } = useTheme();
  if (values.length < 2) return <Txt v="small" color={c.ink2}>No readings yet.</Txt>;

  const w = 320;
  const all = limit == null ? values : [...values, limit];
  const lo = Math.min(...all) - 1;
  const hi = Math.max(...all) + 1;
  const x = (i) => (i / (values.length - 1)) * w;
  const y = (v) => height - ((v - lo) / (hi - lo)) * height;
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');

  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" accessibilityLabel={`Latest ${values[values.length - 1]}`}>
      {limit != null ? <Line x1="0" x2={w} y1={y(limit)} y2={y(limit)} stroke={c.danger} strokeWidth={1.5} strokeDasharray="4 4" /> : null}
      <Polyline points={pts} fill="none" stroke={c.accent} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
