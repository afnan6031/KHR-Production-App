import { syncSystemBars } from './keyboard';
/** Light / Dark / System theme — har device par yaad rehta hai */
export type ThemeChoice = 'system' | 'light' | 'dark';
const KEY = 'khr-theme';
const EVT = 'khr-theme';

export function getTheme(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

export function isDark(choice = getTheme()): boolean {
  return choice === 'dark' || (choice === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
}

export function applyTheme(choice = getTheme()) {
  const root = document.documentElement;
  if (choice === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', choice);
  const dark = isDark(choice);
  // index.html ka pehle-frame wala rang ab CSS sambhalta hai
  root.style.removeProperty('background');
  root.style.colorScheme = dark ? 'dark' : 'light';
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute('content', dark ? '#0B1124' : '#FFFFFF');
  // Windows app ki upar wali patti + Android status bar bhi isi rang mein
  desktop()?.setTheme(dark);
  syncSystemBars(dark);
}

type Desktop = { isDesktop: boolean; setTheme: (dark: boolean) => void; attention: () => void; show: () => void };
/** Windows (Electron) app mein chal rahe hain? */
export function desktop(): Desktop | undefined {
  return (window as unknown as { khrDesktop?: Desktop }).khrDesktop;
}

export function setTheme(choice: ThemeChoice) {
  try {
    localStorage.setItem(KEY, choice);
  } catch {
    /* storage band ho to bas is session ke liye */
  }
  applyTheme(choice);
  window.dispatchEvent(new Event(EVT));
}

export function onThemeChange(fn: () => void): () => void {
  window.addEventListener(EVT, fn);
  const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
  mq?.addEventListener?.('change', fn);
  return () => {
    window.removeEventListener(EVT, fn);
    mq?.removeEventListener?.('change', fn);
  };
}
