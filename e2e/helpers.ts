import type { Page } from '@playwright/test';

export const OSAC_URL = 'https://osac-project.github.io/osac-ux/';

// The RHEM device-management prototype: a PatternFly app whose sections
// (Overview / Fleets / Devices / Repositories) share one URL and are switched
// by the PF nav, and whose device detail is a PF drawer with PF tabs.
export const RHEM_URL = 'https://pamparan.github.io/rhem-design/';

// The VM list / detail / creation-wizard prototype, used by the view-routing
// specs (same-origin subviews that don't change the URL).
export const VMAS_URL = 'https://osac-project.github.io/osac-ux/vmaas-ux-prototype.html';

// The tenant BMAAS prototype: its Bare metal workspace renders instances as a
// card grid or a table, so the same content has two different DOM layouts.
export const BMAAS_URL = 'https://heyethankim.github.io/osac-bmaas/';

export interface TestUser {
  name: string;
  email: string;
  password: string;
}

// Three distinct users used across the collaboration scenarios.
export const USERS: TestUser[] = [
  { name: 'Ana', email: 'ana@example.com', password: 'password123' },
  { name: 'Ben', email: 'ben@example.com', password: 'password123' },
  { name: 'Cat', email: 'cat@example.com', password: 'password123' },
];

export async function signupViaUI(page: Page, user: TestUser): Promise<void> {
  await page.goto('/login');
  // Default mode is "login"; switch to "sign up".
  await page.getByText('Sign up', { exact: true }).click();
  await page.getByLabel('Name').fill(user.name);
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.getByRole('button', { name: 'Sign up', exact: true }).click();
  await page.getByRole('heading', { name: 'Projects' }).waitFor();
}

export async function loginViaUI(page: Page, user: TestUser): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('heading', { name: 'Projects' }).waitFor();
}

export async function logoutViaUI(page: Page): Promise<void> {
  // The avatar menu opens via the toolbar avatar button; the tooltip carries
  // the user's name/email. Click it, then "Log out".
  await page.getByRole('button', { name: /Toggle color theme/ }).waitFor();
  await page.locator('header button').last().click();
  await page.getByText('Log out').click();
  await page.getByRole('button', { name: 'Sign in', exact: true }).waitFor();
}

export async function createProject(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'New project' }).click();
  await page.getByLabel('Project name').fill(name);
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page.getByRole('heading', { name, exact: true }).waitFor();
}

export async function createPersona(page: Page, label: string, url: string): Promise<void> {
  await page.getByRole('button', { name: 'New persona' }).click();
  await page.getByLabel('Persona label').fill(label);
  await page.getByLabel('Design URL').fill(url);
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page.getByText(label, { exact: true }).waitFor();
}

export async function shareProject(
  page: Page,
  email: string,
  status: 'viewer' | 'invited' = 'viewer',
): Promise<void> {
  await page.getByRole('button', { name: 'Share' }).click();
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByText(`${email} · ${status}`).waitFor();
  await page.getByRole('button', { name: 'Done' }).click();
}

export async function openProject(page: Page, name: string): Promise<void> {
  await page.goto('/');
  await page.getByRole('heading', { name, exact: true }).click();
  await page.getByRole('heading', { name, exact: true }).waitFor();
}

export async function openPersona(page: Page, label: string): Promise<void> {
  await page.getByText(label, { exact: true }).click();
  await page.getByText('Comment mode', { exact: true }).waitFor();
}

export async function openThread(page: Page, body: string): Promise<void> {
  await page.getByText(body, { exact: true }).click();
  await page.getByText(/Thread #/).waitFor();
}

export async function selectCommentFilter(page: Page, filter: 'open' | 'resolved' | 'all'): Promise<void> {
  await page.getByRole('button', { name: new RegExp(`^${filter}\\b`) }).click();
}

export async function replyToThread(page: Page, body: string): Promise<void> {
  await page.getByPlaceholder(/Reply to thread/).fill(body);
  await page.getByRole('button', { name: 'Send reply' }).click();
  await page.getByText(body, { exact: true }).waitFor();
}

export async function resolveThread(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Resolve', exact: true }).click();
  await page.getByRole('button', { name: 'Reopen', exact: true }).waitFor();
}

export function projectIdFromUrl(url: string): string {
  const m = url.match(/\/projects\/([^/?#]+)/);
  if (!m) throw new Error(`no project id in url: ${url}`);
  return m[1];
}

export function versionIdFromUrl(url: string): string {
  const m = url.match(/\/versions\/([^/?#]+)/);
  if (!m) throw new Error(`no version id in url: ${url}`);
  return m[1];
}

export interface SeedCommentInput {
  selector: string;
  text_excerpt: string;
  page_url: string;
  step: string;
  /** Declarative view-state key (e.g. `nav=Virtual machines|vm=azure-baboon-27`). */
  state?: string;
  /** How `state` was produced: 'declarative' (default) | 'auto'. */
  state_mode?: string;
  x: number;
  y: number;
  body: string;
}

/**
 * Seed a comment (thread) on a version via the API. `page.request` shares the
 * page's session cookies, so the caller must already be authenticated.
 */
export async function seedComment(page: Page, versionId: string, input: SeedCommentInput) {
  const res = await page.request.post(`/api/versions/${versionId}/comments`, { data: input });
  if (!res.ok()) {
    throw new Error(`seed comment failed: ${res.status()} ${await res.text()}`);
  }
  return res.json();
}
