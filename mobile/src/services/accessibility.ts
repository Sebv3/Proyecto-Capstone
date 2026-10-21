// Secondary text must remain readable on white cards and the pale page surfaces.
export const readableColors = {
  secondary: '#52695C',
  onPrimary: '#FFFFFF',
  primary: '#086F4D',
} as const;

// Text itself uses the OS scale. Only its surrounding layout grows here.
export function textLayout(width: number, fontScale: number) {
  const tabLabelLines = Math.ceil((11 * 12 * fontScale * 0.65) / Math.max(32, width / 5 - 8));
  return {
    stacked: width < 440 || fontScale >= 1.3,
    stepSize: Math.max(34, Math.ceil(24 * fontScale)),
    calendarCellHeight: Math.max(44, Math.ceil(26 * fontScale)),
    tabBarHeight: Math.max(76, Math.ceil(40 + 18 * fontScale * tabLabelLines)),
  };
}
