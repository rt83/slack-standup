export type ThemeColor = 'ink' | 'ink-muted' | 'rule' | 'teal' | 'amber' | 'green' | 'rust';

/** A palette colour as the CSS variable style.css defines it; the charts need real values. */
export function themeColor(name: ThemeColor): string {
  return getComputedStyle(document.documentElement).getPropertyValue(`--color-${name}`).trim();
}
