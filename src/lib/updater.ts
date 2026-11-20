/**
 * v19: Real version check against GitHub Releases (e.g. 1.0.71 vs 1.0.73).
 * Build version comes from GitHub Actions: VITE_APP_VERSION=1.0.<run_number>
 */
import { Capacitor } from '@capacitor/core';

const rawVer = ((import.meta.env.VITE_APP_VERSION as string | undefined) || '1.0.0').trim().replace(/^v/i, '');
export const APP_VERSION = rawVer || '1.0.0';
export const GITHUB_REPO = ((import.meta.env.VITE_GITHUB_REPO as string | undefined) || 'afnan6031/KHR-Production-App').trim();

export interface UpdateResult {
  hasUpdate: boolean;
  current: string;
  latest: string;
  releaseUrl: string;
  downloadUrl: string;
  assetName: string;
  platform: 'android' | 'windows' | 'web';
}

function parseVer(v: string): number[] {
  return v.replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
}

/** true if latest > current (e.g. 1.0.73 > 1.0.71) */
export function isNewerVersion(latest: string, current: string): boolean {
  const a = parseVer(latest);
  const b = parseVer(current);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const x = a[i] || 0;
    const y = b[i] || 0;
    if (x !== y) return x > y;
  }
  return false;
}

export function detectPlatform(): 'android' | 'windows' | 'web' {
  const w = window as unknown as { khrDesktop?: { isDesktop?: boolean } };
  if (w.khrDesktop?.isDesktop) return 'windows';
  if (Capacitor.isNativePlatform()) return 'android';
  return 'web';
}

export async function checkAppUpdate(): Promise<UpdateResult> {
  const platform = detectPlatform();
  const fallbackUrl = `https://github.com/${GITHUB_REPO}/releases/latest`;
  const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json' },
    cache: 'no-store'
  });
  if (!res.ok) throw new Error(`GitHub se update check nahi ho saki (HTTP ${res.status}).`);
  const json = (await res.json()) as {
    tag_name?: string;
    name?: string;
    html_url?: string;
    assets?: { name?: string; browser_download_url?: string }[];
  };
  const latest = String(json.tag_name || json.name || '').replace(/^v/i, '').trim() || APP_VERSION;
  const releaseUrl = json.html_url || fallbackUrl;
  const assets = json.assets || [];

  let asset: { name?: string; browser_download_url?: string } | undefined;
  if (platform === 'android') {
    asset = assets.find((a) => /\.apk$/i.test(a.name || ''));
  } else if (platform === 'windows') {
    asset = assets.find((a) => /\.exe$/i.test(a.name || ''));
  }

  return {
    hasUpdate: isNewerVersion(latest, APP_VERSION),
    current: APP_VERSION,
    latest,
    releaseUrl,
    downloadUrl: asset?.browser_download_url || releaseUrl,
    assetName: asset?.name || '',
    platform
  };
}
