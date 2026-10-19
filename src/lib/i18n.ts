/**
 * v9: App ki zabaan — Roman Urdu (asal) ya Full English.
 * Poori app ke likhe hue alfaaz screen par hi badal diye jate hain (dictionary se), is liye
 * har screen / button / message khud English ho jata hai. Team ke likhe messages, naam,
 * titles waghera kabhi nahi badalte ([data-notr] aur input / textarea ko chhor diya jata hai).
 */
import { EN, EN_PATTERNS } from './i18n-en';

export type Lang = 'ur' | 'en';
let lang: Lang = 'ur';
let observer: MutationObserver | null = null;

const ATTRS = ['placeholder', 'aria-label', 'title'] as const;
const origText = new WeakMap<Text, string>();
const shownText = new WeakMap<Text, string>();
const origAttr = new WeakMap<Element, Record<string, string>>();
const shownAttr = new WeakMap<Element, Record<string, string>>();

/** ek jumla English mein (na mile to null) */
export function toEnglish(s: string): string | null {
  const t = s.trim();
  if (!t || t.length > 400) return null;
  const hit = EN[t];
  if (hit != null) return s.replace(t, hit);
  for (const [re, fn] of EN_PATTERNS) {
    const m = t.match(re);
    if (m) {
      const out = fn(m);
      if (out != null) return s.replace(t, out);
    }
  }
  return null;
}

/** code ke andar se: t('Roman Urdu') -> zabaan ke hisaab se */
export function t(s: string): string {
  return lang === 'en' ? toEnglish(s) ?? s : s;
}
export const getLang = () => lang;

function skipEl(el: Element | null): boolean {
  if (!el) return true;
  const tag = el.tagName;
  if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEXTAREA' || tag === 'CODE' || tag === 'PRE') return true;
  return !!el.closest('[data-notr]');
}

function doText(n: Text) {
  if (skipEl(n.parentElement)) return;
  const cur = n.data;
  if (shownText.get(n) !== cur) origText.set(n, cur); // React ne naya text likha
  const src = origText.get(n) ?? cur;
  const want = lang === 'en' ? toEnglish(src) ?? src : src;
  if (want !== cur) n.data = want;
  shownText.set(n, want);
}

function doAttrs(el: Element) {
  if (skipEl(el) && el.tagName !== 'TEXTAREA') return;
  const o = origAttr.get(el) || {};
  const s = shownAttr.get(el) || {};
  for (const a of ATTRS) {
    const cur = el.getAttribute(a);
    if (cur == null) continue;
    if (s[a] !== cur) o[a] = cur;
    const src = o[a] ?? cur;
    const want = lang === 'en' ? toEnglish(src) ?? src : src;
    if (want !== cur) el.setAttribute(a, want);
    s[a] = want;
  }
  origAttr.set(el, o);
  shownAttr.set(el, s);
}

function walk(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) return doText(root as Text);
  if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;
  if (root.nodeType === Node.ELEMENT_NODE) {
    const el = root as Element;
    if (el.closest('[data-notr]')) return;
    doAttrs(el);
  }
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let n = tw.nextNode();
  while (n) {
    if (n.nodeType === Node.TEXT_NODE) doText(n as Text);
    else doAttrs(n as Element);
    n = tw.nextNode();
  }
}

function start() {
  if (observer) return;
  observer = new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === 'characterData') doText(m.target as Text);
      else if (m.type === 'attributes') doAttrs(m.target as Element);
      else m.addedNodes.forEach((n) => walk(n));
    }
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...ATTRS] });
}

export function setLang(l: Lang) {
  if (l === lang && observer) return;
  lang = l;
  document.documentElement.lang = l === 'en' ? 'en' : 'ur-Latn';
  start();
  walk(document.body);
}
