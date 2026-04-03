import { useDarkMode } from './useDarkMode'

export function useChartColors() {
  const { isDark } = useDarkMode()

  return {
    grid:  isDark ? '#2E3344' : '#F0EEE9',
    axis:  isDark ? '#8A8880' : '#6B6860',
    green: isDark ? '#2DD4A0' : '#1D9E75',
    red:   isDark ? '#F07050' : '#D85A30',
    blue:  isDark ? '#60A5FA' : '#378ADD',
    amber: isDark ? '#FBBF24' : '#EF9F27',
    tooltip: {
      bg:     isDark ? '#1A1D24' : '#FFFFFF',
      border: isDark ? '#2E3344' : '#E8E6E0',
      text:   isDark ? '#F0EEE9' : '#1A1917',
      muted:  isDark ? '#8A8880' : '#6B6860',
    },
  }
}
