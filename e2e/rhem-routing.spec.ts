import { test, expect, type Page } from '@playwright/test';
import {
  RHEM_URL,
  createPersona,
  createProject,
  projectIdFromUrl,
  seedComment,
  signupViaUI,
} from './helpers';

// Comment #1's anchor: the "Fleet" cell ("fitting-room-devices") of the second
// device row in the Devices table.
const DEVICES_FLEET_CELL =
  '#root > div > div > div:nth-of-type(1) > div > div > div > div:nth-of-type(1) > div > div > div:nth-of-type(2) > main > div > section > div > div > div > table > tbody > tr:nth-of-type(2) > td:nth-of-type(4)';

// Comment #3's anchor: the body of the "Events" tab inside a device detail.
const EVENTS_TAB_BODY = '#events-tab > div > div > div';

// Comment #5's anchor: the "Theme" title on the General Settings page. Its
// stored selector is an auto-generated PatternFly OUIA id that changes on
// every render, so it only resolves via the bridge's text-excerpt fallback.
const THEME_TITLE_LEGACY = '[data-ouia-component-id="OUIA-Generated-Title-20"]';

async function listVersions(page: Page, projectId: string) {
  const res = await page.request.get(`/api/projects/${projectId}/versions`);
  if (!res.ok()) throw new Error(`list versions failed: ${res.status()}`);
  return res.json();
}

// The pin must sit on the anchored element, not at the fallback position in
// the top-centre of the preview.
async function expectPinOnElement(page: Page, selector: string) {
  const frame = page.frameLocator('iframe');
  const el = frame.locator(selector).first();
  await expect(el).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(
      async () => {
        const box = await el.boundingBox();
        const pin = await frame.locator('.uxer-pin').first().boundingBox();
        if (!box || !pin) return false;
        const cx = pin.x + pin.width / 2;
        const cy = pin.y + pin.height / 2;
        const tol = 2;
        return (
          cx >= box.x - tol &&
          cx <= box.x + box.width + tol &&
          cy >= box.y - tol &&
          cy <= box.y + box.height + tol
        );
      },
      { timeout: 20_000, message: 'pin should sit on the anchored element' },
    )
    .toBe(true);
}

test.describe('RHEM nav and detail routing', () => {
  test('a comment on the Devices nav routes to its table cell', async ({ browser }) => {
    const ctx = await browser.newContext();
    try {
      const page = await ctx.newPage();
      await signupViaUI(page, { name: 'Nina', email: 'nina@example.com', password: 'password123' });
      await createProject(page, 'RHEM nav');
      const projectId = projectIdFromUrl(page.url());
      await createPersona(page, 'RHEM persona', RHEM_URL);
      const [version] = await listVersions(page, projectId);

      await seedComment(page, version.id, {
        selector: DEVICES_FLEET_CELL,
        text_excerpt: 'fitting-room-devices',
        page_url: RHEM_URL,
        step: '',
        state: 'nav=Devices',
        state_mode: 'declarative',
        x: 0.861141840219326,
        y: 0.96484375,
        body: 'devices list',
      });

      await page.getByText('RHEM persona', { exact: true }).click();
      await page.getByText('Comment mode', { exact: true }).waitFor();
      const frame = page.frameLocator('iframe');
      const devicesNav = frame.locator('.pf-v6-c-nav__link').filter({ hasText: 'Devices' }).first();
      await expect(devicesNav).toBeVisible({ timeout: 60_000 });

      await page.getByText('devices list', { exact: true }).click();
      await expect(page.getByText(/Thread #/)).toBeVisible();

      // The bridge replays nav=Devices and anchors on the recorded cell.
      await expect(devicesNav).toHaveAttribute('aria-current', 'page', { timeout: 30_000 });
      await expectPinOnElement(page, DEVICES_FLEET_CELL);
    } finally {
      await ctx.close();
    }
  });

  test('a comment inside a device detail routes to its Events tab', async ({ browser }) => {
    const ctx = await browser.newContext();
    try {
      const page = await ctx.newPage();
      await signupViaUI(page, { name: 'Nora', email: 'nora@example.com', password: 'password123' });
      await createProject(page, 'RHEM detail');
      const projectId = projectIdFromUrl(page.url());
      await createPersona(page, 'RHEM detail persona', RHEM_URL);
      const [version] = await listVersions(page, projectId);

      await seedComment(page, version.id, {
        selector: EVENTS_TAB_BODY,
        text_excerpt: 'Events Refresh events',
        page_url: RHEM_URL,
        step: '',
        state: 'nav=Devices|tab=Events',
        state_mode: 'declarative',
        x: 0.182075471698113,
        y: 0.147058823529412,
        body: 'events tab',
      });

      await page.getByText('RHEM detail persona', { exact: true }).click();
      await page.getByText('Comment mode', { exact: true }).waitFor();
      const frame = page.frameLocator('iframe');
      await expect(
        frame.locator('.pf-v6-c-nav__link').filter({ hasText: 'Devices' }).first(),
      ).toBeVisible({ timeout: 60_000 });

      await page.getByText('events tab', { exact: true }).click();
      await expect(page.getByText(/Thread #/)).toBeVisible();

      // The bridge opens the device detail and activates the recorded tab.
      await expect(
        frame.locator('.pf-v6-c-tabs__item.pf-m-current .pf-v6-c-tabs__item-text'),
      ).toHaveText('Events', { timeout: 30_000 });
      await expectPinOnElement(page, EVENTS_TAB_BODY);
    } finally {
      await ctx.close();
    }
  });

  test('a comment inside Settings routes to its Theme section', async ({ browser }) => {
    const ctx = await browser.newContext();
    try {
      const page = await ctx.newPage();
      await signupViaUI(page, { name: 'Noa', email: 'noa@example.com', password: 'password123' });
      await createProject(page, 'RHEM settings');
      const projectId = projectIdFromUrl(page.url());
      await createPersona(page, 'RHEM settings persona', RHEM_URL);
      const [version] = await listVersions(page, projectId);

      // The stored selector is stale (OUIA-generated id), so routing relies on
      // the bridge's text-excerpt fallback plus the Settings subview opener.
      await seedComment(page, version.id, {
        selector: THEME_TITLE_LEGACY,
        text_excerpt: 'Theme',
        page_url: RHEM_URL,
        step: '',
        state: 'nav=Repositories',
        state_mode: 'declarative',
        x: 0.0714285714285714,
        y: 0.376293823038397,
        body: 'settings',
      });

      await page.getByText('RHEM settings persona', { exact: true }).click();
      await page.getByText('Comment mode', { exact: true }).waitFor();
      const frame = page.frameLocator('iframe');
      await expect(
        frame.locator('.pf-v6-c-nav__link').filter({ hasText: 'Devices' }).first(),
      ).toBeVisible({ timeout: 60_000 });

      await page.getByText('settings', { exact: true }).click();
      await expect(page.getByText(/Thread #/)).toBeVisible();

      // The bridge opens Settings and anchors on the Theme title via the
      // captured excerpt.
      await expect(frame.locator('.settings-sidebar-container')).toBeVisible({ timeout: 30_000 });
      const themeTitle = frame.locator('h2').filter({ hasText: 'Theme' }).first();
      await expect(themeTitle).toBeVisible({ timeout: 30_000 });
      await expect
        .poll(
          async () => {
            const box = await themeTitle.boundingBox();
            const pin = await frame.locator('.uxer-pin').first().boundingBox();
            if (!box || !pin) return false;
            const cx = pin.x + pin.width / 2;
            const cy = pin.y + pin.height / 2;
            const tol = 2;
            return (
              cx >= box.x - tol &&
              cx <= box.x + box.width + tol &&
              cy >= box.y - tol &&
              cy <= box.y + box.height + tol
            );
          },
          { timeout: 20_000, message: 'pin should sit on the Theme title' },
        )
        .toBe(true);
    } finally {
      await ctx.close();
    }
  });
});
