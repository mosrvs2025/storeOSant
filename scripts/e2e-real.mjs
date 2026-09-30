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
let promptAnswer = '';
page.on('dialog', (d) => d.accept(promptAnswer || undefined));
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
  await page.getByRole('button', { name: /Type it in/ }).click();
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

  // Walk aisle 6 with the scanner: 4 tags down the left, 2 back up the right
  await page.locator('.verb', { hasText: 'Walk an Aisle' }).click();
  await page.locator('.num-grid .ap', { hasText: /^6$/ }).click();
  await page.getByPlaceholder(/Chips · Soda/).fill('Chips · Salsa');
  await page.getByRole('button', { name: /Start aisle 6/ }).click();
  await see('shelf tag on your left');
  for (const c of ['011111000017', '011111000024', '011111000031', '011111000048']) await gun(c);
  await shot('walk-left');
  await page.getByRole('button', { name: /other side/ }).click();
  await see('Turn around');
  for (const c of ['011111000055', '011111000062']) await gun(c);
  await page.getByRole('button', { name: /Finish aisle/ }).click();
  await see('Aisle 6 learned');
  await shot('walk-done');
  step('walked aisle 6: ' + (await page.locator('.done-stats').innerText()).replace(/\n/g, ' '));
  // Aisle 17 doesn't exist yet in a 16-aisle store: walking it grows the floor plan
  await page.getByRole('button', { name: 'Done for now' }).click();
  await page.locator('.verb', { hasText: 'Walk an Aisle' }).click();
  await page.locator('.num-grid .other').fill('17');
  await page.getByRole('button', { name: /Start aisle 17/ }).click();
  await see('Aisle 17 · left side');
  await gun('011111000079');
  await page.getByRole('button', { name: /other side/ }).click();
  await page.getByRole('button', { name: /Finish aisle/ }).click();
  await see('Aisle 17 learned');
  step('aisle 17 added by walking it');
  const cfg = await page.evaluate(() => JSON.parse(localStorage.getItem('storeos.config')));
  if (cfg.aisles !== 17 || cfg.aisleNames[6] !== 'Chips · Salsa') throw new Error('config lost: ' + JSON.stringify(cfg));
  await page.getByRole('button', { name: 'Done for now' }).click();
  // Name one of the aisle-6 items, as a worker would from Settings
  await page.goto(URL + '#settings');
  await page.getByPlaceholder('Search name or UPC…').fill('000017');
  promptAnswer = 'Doritos Nacho Cheese';
  await page.getByRole('button', { name: 'Rename' }).first().click();
  promptAnswer = '';
  await page.goto(URL + '#home');

  // Map aisle 6 section A left with the scanner gun
  await page.getByRole('button', { name: /Map a Spot/ }).click();
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
  await page.getByRole('button', { name: /Map a Spot/ }).click();
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
  await page.getByPlaceholder(/What is it/).fill('Doritos Cool Ranch');
  await see('Probably Aisle 6');
  await shot('guess');
  step('guess: ' + (await page.locator('.guess').innerText()).replace(/\n/g, ' · '));
  await page.getByRole('button', { name: 'Use the guess' }).click();
  await gun('049000028928');
  await see('New item — teach StoreOS');
  await page.getByPlaceholder(/What is it/).fill('Sprite 2L');
  await page.locator('.sheet .ap', { hasText: /^3$/ }).click();
  await shot('learn-new');
  await page.getByRole('button', { name: /Save — Aisle 3/ }).click();
  await see('4 items');
  await shot('gobacks');
  await page.getByRole('button', { name: /Start Route/ }).click();
  await see('NEXT');
  const first = await page.locator('.nb-main h1').innerText();
  step('route first stop: ' + first + ' (freezer should be first)');
  await shot('nav');
  for (let i = 0; i < 8 && (await page.locator('.nav').count()); i++) {
    await page.locator('.sc-actions .btn.primary').click();
    await page.waitForTimeout(250);
  }
  await see('Cart cleared');
  step('route done');

  await page.reload();
  await page.goto(URL + '#settings');
  await see('Catalog · 13 products');
  await shot('settings');
  step('persisted after reload: 13 products');
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
