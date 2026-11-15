import type { ReactNode } from 'react';

const base = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;
const I = ({ children }: { children: ReactNode }) => <svg {...base}>{children}</svg>;

export const IconHome = () => <I><path d="M4 11.5 12 5l8 6.5" /><path d="M6 10.5V19h12v-8.5" /><path d="M10 19v-5h4v5" /></I>;
export const IconTimer = () => <I><circle cx="12" cy="13" r="7.5" /><path d="M12 9v4l2.5 1.5" /><path d="M9.5 3.5h5" /></I>;
export const IconMap = () => <I><path d="M9 4 3.5 6.5v13L9 17l6 3 5.5-2.5v-13L15 7 9 4Z" /><path d="M9 4v13M15 7v13" /></I>;
export const IconChart = () => <I><path d="M5 19V11M12 19V5M19 19v-6" /></I>;
export const IconGear = () => <I><circle cx="12" cy="12" r="3" /><path d="M19.4 14.5a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3h0a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5h0a1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8v0a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z" /></I>;
export const IconPlay = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M7 4.5v15l12-7.5-12-7.5Z" /></svg>;
