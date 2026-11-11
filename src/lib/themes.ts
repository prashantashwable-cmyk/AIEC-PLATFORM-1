// Design themes. A theme is a set of design-token values (colours, radius, font); every component
// reads tokens, so switching theme never needs per-page changes. DEFAULT_THEME is what users see.

type Scale = [string, string, string, string, string, string, string, string, string, string, string]; // 50 … 950
const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;

const VIOLET: Scale = ['#f5f3ff', '#ede9fe', '#ddd6fe', '#c4b5fd', '#a78bfa', '#8b5cf6', '#7c3aed', '#6d28d9', '#5b21b6', '#4c1d95', '#2e1065'];
const INDIGO: Scale = ['#eef2ff', '#e0e7ff', '#c7d2fe', '#a5b4fc', '#818cf8', '#6366f1', '#4f46e5', '#4338ca', '#3730a3', '#312e81', '#1e1b4b'];
const CYAN: Scale = ['#ecfeff', '#cffafe', '#a5f3fc', '#67e8f9', '#22d3ee', '#06b6d4', '#0891b2', '#0e7490', '#155e75', '#164e63', '#083344'];
const NAVY: Scale = ['#eef4ff', '#dbe6fe', '#bfd3fe', '#93b4fd', '#5f8df8', '#3a6ae8', '#2450c9', '#1d3fa3', '#193582', '#122659', '#0b173a'];
const EMERALD: Scale = ['#ecfdf5', '#d1fae5', '#a7f3d0', '#6ee7b7', '#34d399', '#10b981', '#059669', '#047857', '#065f46', '#064e3b', '#022c22'];
const TEAL: Scale = ['#f0fdfa', '#ccfbf1', '#99f6e4', '#5eead4', '#2dd4bf', '#14b8a6', '#0d9488', '#0f766e', '#115e59', '#134e4a', '#042f2e'];
const BLUE: Scale = ['#eff6ff', '#dbeafe', '#bfdbfe', '#93c5fd', '#60a5fa', '#3b82f6', '#2563eb', '#1d4ed8', '#1e40af', '#1e3a8a', '#172554'];
const ZINC: Scale = ['#fafafa', '#f4f4f5', '#e4e4e7', '#d4d4d8', '#a1a1aa', '#71717a', '#52525b', '#3f3f46', '#27272a', '#18181b', '#09090b'];
const STONE: Scale = ['#fafaf9', '#f5f5f4', '#e7e5e4', '#d6d3d1', '#a8a29e', '#78716c', '#57534e', '#44403c', '#292524', '#1c1917', '#0c0a09'];
const SLATE: Scale = ['#f8fafc', '#f1f5f9', '#e2e8f0', '#cbd5e1', '#94a3b8', '#64748b', '#475569', '#334155', '#1e293b', '#0f172a', '#020617'];
const INK: Scale = ['#fafafa', '#f4f4f5', '#e4e4e7', '#d4d4d8', '#a1a1aa', '#52525b', '#27272a', '#18181b', '#09090b', '#09090b', '#000000'];
const TERRACOTTA: Scale = ['#fdf6f0', '#fbe9dc', '#f6d0b8', '#efb08d', '#e58a5e', '#d96b3c', '#c2542a', '#a04424', '#833a23', '#6b3120', '#3a180e'];

export interface Theme {
  id: string;
  name: string;
  brand: Scale;
  neutral?: Scale;
  dark?: boolean;
  accent: [string, string, string]; // 400, 500, 600
  onBrand: string;
  onAccent: string;
  surface: string;
  page: string;
  hero: { from: string; via: string; to: string; fg: string; muted: string; tile: string; line: string };
  sidebar: { bg: string; fg: string; strong: string; active: string };
  ink: { bg: string; fg: string; muted: string };
  radius: string; // base radius for controls (rounded-lg)
  font: string;
}

const DEVANAGARI = '"Noto Sans Devanagari Variable"';
const FALLBACK = 'ui-sans-serif, system-ui, sans-serif';
const font = (name: string) => `"${name}", ${DEVANAGARI}, ${FALLBACK}`;
const LIGHT_HERO = { tile: '#ffffff', line: '#e2e8f0' };
const DARK_HERO = { tile: 'rgb(255 255 255 / 0.08)', line: 'rgb(255 255 255 / 0.18)' };

export const THEMES: Theme[] = [
  {
    id: 'enterprise', name: 'Aerchain-style Enterprise', brand: VIOLET, accent: ['#a78bfa', '#7c3aed', '#6d28d9'], onBrand: '#ffffff', onAccent: '#ffffff',
    surface: '#ffffff', page: '#f8fafc', hero: { from: '#ffffff', via: '#f5f3ff', to: '#ede9fe', fg: '#1e1b4b', muted: '#4b5563', ...LIGHT_HERO },
    sidebar: { bg: '#ffffff', fg: '#475569', strong: '#6d28d9', active: '#f5f3ff' }, ink: { bg: '#1e1b4b', fg: '#ffffff', muted: '#c7d2fe' },
    radius: '0.75rem', font: font('Plus Jakarta Sans Variable'),
  },
  {
    id: 'midnight', name: 'Midnight Pro', brand: [...CYAN].reverse() as Scale, neutral: [...SLATE].reverse() as Scale, dark: true,
    accent: ['#67e8f9', '#22d3ee', '#06b6d4'], onBrand: '#020617', onAccent: '#020617', surface: '#0f172a', page: '#020617',
    hero: { from: '#020617', via: '#0b1220', to: '#0c4a6e', fg: '#f8fafc', muted: '#cbd5e1', ...DARK_HERO },
    sidebar: { bg: '#020617', fg: '#94a3b8', strong: '#67e8f9', active: 'rgb(255 255 255 / 0.08)' }, ink: { bg: '#0b1220', fg: '#f8fafc', muted: '#94a3b8' },
    radius: '0.5rem', font: font('Inter Variable'),
  },
  {
    id: 'saffron', name: 'Saffron Trust', brand: NAVY, accent: ['#fbb040', '#f59316', '#d9730a'], onBrand: '#ffffff', onAccent: '#1c1917', surface: '#ffffff', page: '#f8fafc',
    hero: { from: '#122659', via: '#193582', to: '#1d3fa3', fg: '#ffffff', muted: '#dbe6fe', ...DARK_HERO },
    sidebar: { bg: '#0b173a', fg: '#bfd3fe', strong: '#ffffff', active: 'rgb(255 255 255 / 0.14)' }, ink: { bg: '#0b173a', fg: '#ffffff', muted: '#bfd3fe' },
    radius: '0.5rem', font: font('Inter Variable'),
  },
  {
    id: 'emerald', name: 'Emerald Fintech', brand: EMERALD, accent: ['#34d399', '#059669', '#047857'], onBrand: '#ffffff', onAccent: '#ffffff', surface: '#ffffff', page: '#f8fafc',
    hero: { from: '#ecfdf5', via: '#ffffff', to: '#d1fae5', fg: '#022c22', muted: '#374151', ...LIGHT_HERO },
    sidebar: { bg: '#ffffff', fg: '#475569', strong: '#047857', active: '#ecfdf5' }, ink: { bg: '#022c22', fg: '#ffffff', muted: '#a7f3d0' },
    radius: '0.625rem', font: font('Manrope Variable'),
  },
  {
    id: 'steel', name: 'Steel Industrial', brand: ZINC, neutral: ZINC, accent: ['#fde047', '#facc15', '#eab308'], onBrand: '#ffffff', onAccent: '#18181b', surface: '#ffffff', page: '#f4f4f5',
    hero: { from: '#18181b', via: '#27272a', to: '#3f3f46', fg: '#ffffff', muted: '#d4d4d8', ...DARK_HERO },
    sidebar: { bg: '#18181b', fg: '#a1a1aa', strong: '#facc15', active: 'rgb(255 255 255 / 0.08)' }, ink: { bg: '#18181b', fg: '#ffffff', muted: '#a1a1aa' },
    radius: '0.25rem', font: font('Inter Variable'),
  },
  {
    id: 'aurora', name: 'Glass Aurora', brand: INDIGO, accent: ['#f472b6', '#db2777', '#be185d'], onBrand: '#ffffff', onAccent: '#ffffff', surface: 'rgb(255 255 255 / 0.78)',
    page: 'linear-gradient(135deg, #eef2ff 0%, #fdf4ff 45%, #ecfeff 100%) fixed',
    hero: { from: '#e0e7ff', via: '#fae8ff', to: '#cffafe', fg: '#1e1b4b', muted: '#4b5563', tile: 'rgb(255 255 255 / 0.7)', line: 'rgb(255 255 255 / 0.9)' },
    sidebar: { bg: 'rgb(255 255 255 / 0.7)', fg: '#475569', strong: '#4338ca', active: 'rgb(99 102 241 / 0.12)' }, ink: { bg: '#312e81', fg: '#ffffff', muted: '#c7d2fe' },
    radius: '1rem', font: font('Plus Jakarta Sans Variable'),
  },
  {
    id: 'mono', name: 'Minimal Mono', brand: INK, neutral: ZINC, accent: ['#3f3f46', '#18181b', '#000000'], onBrand: '#ffffff', onAccent: '#ffffff', surface: '#ffffff', page: '#ffffff',
    hero: { from: '#ffffff', via: '#ffffff', to: '#f4f4f5', fg: '#09090b', muted: '#52525b', ...LIGHT_HERO },
    sidebar: { bg: '#fafafa', fg: '#52525b', strong: '#09090b', active: '#e4e4e7' }, ink: { bg: '#09090b', fg: '#ffffff', muted: '#a1a1aa' },
    radius: '0rem', font: font('Inter Variable'),
  },
  {
    id: 'royal', name: 'Royal Blue Corporate', brand: BLUE, accent: ['#fcd34d', '#fbbf24', '#f59e0b'], onBrand: '#ffffff', onAccent: '#172554', surface: '#ffffff', page: '#f1f5f9',
    hero: { from: '#172554', via: '#1e3a8a', to: '#1d4ed8', fg: '#ffffff', muted: '#dbeafe', ...DARK_HERO },
    sidebar: { bg: '#172554', fg: '#bfdbfe', strong: '#ffffff', active: 'rgb(255 255 255 / 0.14)' }, ink: { bg: '#172554', fg: '#ffffff', muted: '#bfdbfe' },
    radius: '0.375rem', font: font('Inter Variable'),
  },
  {
    id: 'sand', name: 'Warm Sand', brand: TERRACOTTA, neutral: STONE, accent: ['#57534e', '#292524', '#1c1917'], onBrand: '#ffffff', onAccent: '#ffffff', surface: '#fffdfa', page: '#faf6f1',
    hero: { from: '#faf6f1', via: '#f6ebdd', to: '#f1e0cb', fg: '#3a180e', muted: '#57534e', tile: '#fffdfa', line: '#e7e5e4' },
    sidebar: { bg: '#292524', fg: '#d6d3d1', strong: '#f6d0b8', active: 'rgb(255 255 255 / 0.1)' }, ink: { bg: '#292524', fg: '#fffdfa', muted: '#d6d3d1' },
    radius: '0.5rem', font: font('Manrope Variable'),
  },
  {
    id: 'teal', name: 'Teal Material', brand: TEAL, accent: ['#fbbf24', '#f59e0b', '#d97706'], onBrand: '#ffffff', onAccent: '#1c1917', surface: '#ffffff', page: '#f6fbfa',
    hero: { from: '#f0fdfa', via: '#ffffff', to: '#ccfbf1', fg: '#134e4a', muted: '#475569', ...LIGHT_HERO },
    sidebar: { bg: '#f0fdfa', fg: '#115e59', strong: '#0f766e', active: '#ccfbf1' }, ink: { bg: '#134e4a', fg: '#ffffff', muted: '#99f6e4' },
    radius: '1.25rem', font: font('Manrope Variable'),
  },
];

export const DEFAULT_THEME = 'enterprise';
export const THEME_COOKIE = 'aiec_theme';
export function isTheme(id: unknown): id is string {
  return typeof id === 'string' && THEMES.some((t) => t.id === id);
}

function scaleVars(prefix: string, scale: Scale): string {
  return SHADES.map((shade, i) => `--color-${prefix}-${shade}:${scale[i]};`).join('');
}

/** CSS custom properties for one theme, scoped to `[data-theme="<id>"]`. */
export function themeCss(theme: Theme): string {
  const r = theme.radius;
  return `[data-theme="${theme.id}"]{${scaleVars('brand', theme.brand)}${theme.neutral ? scaleVars('slate', theme.neutral) : ''}`
    + `--color-accent-400:${theme.accent[0]};--color-accent-500:${theme.accent[1]};--color-accent-600:${theme.accent[2]};`
    + `--color-on-brand:${theme.onBrand};--color-on-accent:${theme.onAccent};--color-surface:${theme.surface};--page-bg:${theme.page};`
    + `--color-hero-from:${theme.hero.from};--color-hero-via:${theme.hero.via};--color-hero-to:${theme.hero.to};--color-hero-fg:${theme.hero.fg};`
    + `--color-hero-muted:${theme.hero.muted};--color-hero-tile:${theme.hero.tile};--color-hero-line:${theme.hero.line};`
    + `--color-sidebar:${theme.sidebar.bg};--color-sidebar-fg:${theme.sidebar.fg};--color-sidebar-strong:${theme.sidebar.strong};--color-sidebar-active:${theme.sidebar.active};`
    + `--color-ink:${theme.ink.bg};--color-ink-fg:${theme.ink.fg};--color-ink-muted:${theme.ink.muted};`
    + `--radius-md:calc(${r} * 0.75);--radius-lg:${r};--radius-xl:calc(${r} * 1.4);--radius-2xl:calc(${r} * 1.9);`
    + `--font-sans:${theme.font};font-family:${theme.font};color-scheme:${theme.dark ? 'dark' : 'light'};}`;
}

export const ALL_THEMES_CSS = THEMES.map(themeCss).join('\n');
