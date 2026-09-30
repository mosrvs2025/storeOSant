// E2E for "my own store": setup → map shelves with a (simulated) Bluetooth scanner →
// go-backs with a brand-new item → route → persistence across reload.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const OUT = process.env.SHOTS ?? 'e2e-shots/real';
mkdirSync(OUT, { recursive: true });
const PORT = String(4400 + Math.floor(Math.random() * 500));
const URL = `http://localhost:${PORT}/`;
const server = spawn('npx', ['vite', 'preview', '--port', PORT, '--strictPort'], { stdio: 'pipe' });
process.on('exit', () => server.kill());
await new Promise((r) => server.stdout.on('data', (d) => String(d).includes(PORT) && r()));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('dialog', (d) => d.accept());
let n = 0;
const shot = (name) => page.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-${name}.png` });
const see = (t) => page.getByText(t, { exact: false }).first().waitFor({ timeout: 6000 });
const step = (s) => console.log('•', s);
// A Bluetooth scanner in HID mode = very fast keystrokes + Enter, with nothing focused.
const gun = async (code) => {
  await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
  await page.keyboard.type(code, { delay: 8 });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
};
try {
  await page.goto(URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: /Set up my store/ }).click();
  await page.getByPlaceholder('e.g. Safeway').fill('Test Market');
  await page.getByPlaceholder('#1234').fill('#77');
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: '+' }).click();
  const names = page.getByPlaceholder(/What’s in it/);
  await names.nth(5).fill('Chips');
  await names.nth(14).fill('Frozen');
  await page.locator('.an-row').nth(14).locator('.ice-toggle').click();
  await shot('setup-form');
  await page.getByRole('button', { name: /Create my store/ }).click();
  await see('Teach StoreOS your store');
  await shot('home-empty');
  step('store created');

  // Map aisle 6 section A left with the scanner gun
  await page.getByRole('button', { name: /Map a Shelf/ }).click();
  await page.locator('.ap', { hasText: /^6$/ }).click();
  await page.getByRole('button', { name: /A◀/ }).click();
  await page.getByRole('button', { name: /Start scanning/ }).click();
  await see('Ready for your scanner');
  await gun('028400090896');
  await gun('012000161155');
  await page.getByRole('button', { name: /Next section/ }).click();
  await gun('044000032029');
  await page.waitForTimeout(400);
  await shot('mapping');
  const scanned = await page.locator('.ms-stats').innerText();
  step('mapped: ' + scanned.replace(/\n/g, ' '));
  // rename a placeholder
  await page.locator('.scanned li').first().getByRole('button', { name: 'Rename' }).click().catch(() => {});
  await page.getByRole('button', { name: 'Done' }).click();

  // Map a freezer spot
  await page.getByRole('button', { name: /Map a Shelf/ }).click();
  await page.locator('.ap', { hasText: /^15$/ }).click();
  await page.getByRole('button', { name: /Start scanning/ }).click();
  await gun('077567254238');
  await page.getByRole('button', { name: 'Done' }).click();

  // Go-backs: two known items + one never seen before
  await page.getByRole('button', { name: /Go-Backs/ }).click();
  await gun('028400090896');
  await gun('077567254238');
  await gun('049000028911');
  await see('New item — teach StoreOS');
  await page.getByPlaceholder(/What is it/).fill('Sprite 2L');
  await page.locator('.sheet .ap', { hasText: /^3$/ }).click();
  await shot('learn-new');
  await page.getByRole('button', { name: /Save — it lives at/ }).click();
  await see('3 items');
  await shot('gobacks');
  await page.getByRole('button', { name: /Start Route/ }).click();
  await see('NEXT');
  const first = await page.locator('.nb-main h1').innerText();
  step('route first stop: ' + first + ' (freezer should be first)');
  await shot('nav');
  for (let i = 0; i < 6 && (await page.locator('.nav').count()); i++) {
    await page.locator('.sc-actions .btn.primary').click();
    await page.waitForTimeout(250);
  }
  await see('Cart cleared');
  step('route done');

  await page.reload();
  await page.goto(URL + '#settings');
  await see('Catalog · 5 products');
  await shot('settings');
  step('persisted after reload: 5 products');
  await page.goto(URL + '#home');
  await page.waitForTimeout(600);
  await shot('home-after');
  const dl = page.waitForEvent('download');
  await page.goto(URL + '#settings');
  await page.getByRole('button', { name: /Export/ }).click();
  step('backup file: ' + (await (await dl).suggestedFilename()));
} catch (e) {
  await page.screenshot({ path: `${OUT}/FAIL.png` });
  console.error('FAIL', String(e.message).split('\n')[0]);
  process.exitCode = 1;
}
await browser.close();
server.kill();
if (errors.length) {
  console.error('Page errors:\n' + errors.join('\n'));
  process.exitCode = 1;
}
if (!process.exitCode) console.log('E2E REAL OK');
