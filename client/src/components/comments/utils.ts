import type { TFunction } from 'i18next';
import type { Comment } from '../../api/types';
import type { BlockedInfo } from './types';

export function timeAgo(t: TFunction, iso: string): string {
  const then = new Date(iso).getTime();
  const secs = Math.round((Date.now() - then) / 1000);
  if (Number.isNaN(secs) || secs < 0) return '';
  if (secs < 60) return t('comments.timeAgo.justNow');
  const mins = Math.round(secs / 60);
  if (mins < 60) return t('comments.timeAgo.minutesAgo', { n: mins });
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return t('comments.timeAgo.hoursAgo', { n: hrs });
  const days = Math.round(hrs / 24);
  if (days < 7) return t('comments.timeAgo.daysAgo', { n: days });
  return new Date(iso).toLocaleDateString();
}

export type Authorish = { author?: { name: string; email: string } | null };

export function displayName(t: TFunction, a: Authorish | null | undefined): string {
  return a?.author?.name || a?.author?.email || t('comments.anonymous');
}

// Distinct avatar colors, assigned deterministically per user so the same
// person always gets the same color across the thread.
export const USER_COLORS = [
  '#2563eb', // blue
  '#7c3aed', // violet
  '#db2777', // pink
  '#dc2626', // red
  '#ea580c', // orange
  '#16a34a', // green
  '#0d9488', // teal
  '#9333ea', // purple
];

export function userColor(id: string): string {
  const key = id || 'anonymous';
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return USER_COLORS[h % USER_COLORS.length];
}

// Normalize a stored page_url to a navigable design URL. Handles legacy
// values that were accidentally stored in proxied form.
export function normalizeDesignUrl(pageUrl: string): string {
  if (!pageUrl) return '';
  const marker = '/__uxer__/p/';
  const idx = pageUrl.indexOf(marker);
  if (idx === -1) return pageUrl;
  const token = pageUrl.slice(idx + marker.length);
  const slash = token.indexOf('/');
  const b64 = slash === -1 ? token : token.slice(0, slash);
  const rest = slash === -1 ? '' : token.slice(slash);
  try {
    let b = b64.replace(/-/g, '+').replace(/_/g, '/');
    while (b.length % 4 !== 0) b += '=';
    const decoded = atob(b);
    const nl = decoded.indexOf('\n');
    const origin = nl === -1 ? decoded : decoded.slice(0, nl);
    return origin + rest;
  } catch {
    return '';
  }
}

// Derive a human-friendly page name from a comment's page_url (e.g. the
// "security-groups" path becomes "security groups"), or '' when no page is
// recorded.
export function pageName(pageUrl: string): string {
  const url = normalizeDesignUrl(pageUrl);
  if (!url) return '';
  try {
    const seg = new URL(url).pathname.split('/').filter(Boolean).pop();
    return seg ? seg.replace(/[-_]+/g, ' ') : '';
  } catch {
    return '';
  }
}

// Format a comment's page label as "[page name] page" (e.g. "security groups
// page"), or '' when no page is recorded.
export function pageLabel(t: TFunction, c: Comment): string {
  const name = pageName(c.page_url);
  return name ? t('comments.pageLabel', { name }) : '';
}

export function blockedHint(t: TFunction, info: BlockedInfo): string {
  const label = info.stepLabel?.trim() || t('comments.thatStep');
  if (info.reason === 'wizard-not-open') {
    return t('comments.blockedHintWizardNotOpen', { label });
  }
  if (info.reason === 'element-not-found') {
    return t('comments.blockedHintElementNotFound');
  }
  return t('comments.blockedHintMissingFields', { label });
}
