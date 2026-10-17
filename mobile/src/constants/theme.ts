/** Colors mirror the web dashboard so both apps feel like one product. */
export const Colors = {
  light: {
    text: '#121826',
    textSecondary: '#5b6475',
    background: '#f7f8fb',
    surface: '#ffffff',
    surface2: '#f1f3f8',
    border: '#e3e7ef',
    primary: '#3355ff',
    primaryInk: '#ffffff',
    primarySoft: '#e8edff',
    success: '#0f8a5f',
    successSoft: '#e3f6ee',
    warning: '#a35b00',
    warningSoft: '#fff3df',
    danger: '#c22f3d',
    dangerSoft: '#fde8ea',
  },
  dark: {
    text: '#e8ecf4',
    textSecondary: '#9aa4b8',
    background: '#0d111a',
    surface: '#151a26',
    surface2: '#1c2231',
    border: '#283044',
    primary: '#6f8bff',
    primaryInk: '#0d111a',
    primarySoft: '#1f2a4d',
    success: '#4fd1a1',
    successSoft: '#133328',
    warning: '#ffb44d',
    warningSoft: '#3a2a12',
    danger: '#ff7b88',
    dangerSoft: '#3d1a20',
  },
} as const;

export type Palette = (typeof Colors)['light'] | (typeof Colors)['dark'];

export const Spacing = { one: 4, two: 8, three: 12, four: 16, five: 24, six: 32 } as const;
