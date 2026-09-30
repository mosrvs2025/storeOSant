// End-to-end walk through the primary workflow on a phone-sized viewport.
// Usage: npm run build && npm run e2e   (serves dist/ with vite preview)
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const OUT = process.env.SHOTS ?? 'e2e-shots';
mkdirSync(OUT, { recursive: true });
const PORT = String(4400 + Math.floor(Math.random() * 500));
const URL = `http://localhost:${PORT}/`;
const server = spawn('npx', ['vite', 'preview', '--port', PORT, '--strictPort'], { stdio: 'pipe' });
await new Promise((r) => server.stdout.on('data', (d) => String(d).includes(PORT) && r()));

process.on('exit', () => server.kill());
process.on('uncaughtException', (e) => { console.error(e.message.split('\n')[0]); server.kill(); process.exit(1); });
process.on('unhandledRejection', async (e) => { console.error(String(e?.message ?? e).split('\n').slice(0, 3).join(' | ')); await globalThis.__page?.screenshot({ path: `${OUT}/FAIL.png` }).catch(() => {}); server.kill(); process.exit(1); });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
globalThis.__page = page;
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('dialog', (d) => d.accept());
let n = 0;
const shot = async (name) => page.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-${name}.png` });
const step = (s) => console.log('•', s);
const expectText = async (t) => {
  await page.getByText(t, { exact: false }).first().waitFor({ timeout: 5000 });
};

await page.goto(URL);
await page.evaluate(() => localStorage.clear());
await page.reload();
await expectText('Try the demo store');
await shot('setup');
await page.getByRole('button', { name: /Try the demo store/ }).click();
await expectText('What are you doing?');
await page.waitForTimeout(700);
await shot('home');
step('home renders');

await page.getByRole('button', { name: /Go-Backs/ }).click();
await expectText('Cart from the service desk');
await page.getByRole('button', { name: /Scan Mac & Cheese/ }).click();
await page.getByRole('button', { name: /Scan Coca-Cola/ }).click();
await shot('scan-two');
await page.getByRole('button', { name: /Scan whole cart/ }).click();
await expectText('15 items');
await page.waitForTimeout(600);
await shot('scan-full');
step('scanned 15 items');

await page.getByRole('button', { name: /Start Route/ }).click();
await expectText('NEXT');
await page.waitForTimeout(800);
await shot('nav-first');
step('route started: ' + (await page.locator('.nb-main h1').innerText()) + ' / ' + (await page.locator('.nb-count b').innerText()));

let learned = false;
for (let i = 0; i < 20; i++) {
  if (!(await page.locator('.nav').count())) break;
  const names = await page.locator('.sc-items .it b').allInnerTexts();
  if (!learned && names.includes('Oreo Pumpkin Spice')) {
    await page.locator('.sc-items li', { hasText: 'Oreo Pumpkin Spice' }).getByRole('button', { name: /Not here/ }).click();
    await expectText('Where is it actually?');
    await shot('correct-sheet');
    await page.getByPlaceholder(/endcap facing aisle six/).fill("It's actually on the endcap facing aisle six");
    await page.locator('.correct .voice-input').evaluate((f) => f.requestSubmit());
    await expectText('Endcap 6 · front');
    await page.waitForTimeout(700);
    await shot('correct-picked');
    await page.getByRole('button', { name: /teach StoreOS/ }).click();
    await expectText('Reality Layer updated');
    await page.waitForTimeout(1200);
    await shot('learned');
    step('learned: ' + (await page.locator('.learn-bars').innerText()).replace(/\n/g, ' '));
    await page.getByRole('button', { name: 'Keep going' }).click();
    learned = true;
    continue;
  }
  if (i === 3) await shot('nav-mid');
  await page.locator('.sc-actions .btn.primary').click();
  await page.waitForTimeout(250);
}
await expectText('What the store learned');
await page.waitForTimeout(500);
await shot('done');
step('route completed; learned=' + learned);

await page.getByRole('button', { name: 'See the Reality Layer' }).click();
await expectText('Oreo Pumpkin Spice');
await shot('reality');
await page.locator('.rl-list li', { hasText: 'Oreo Pumpkin Spice' }).first().click();
await expectText('Where it lives');
await page.waitForTimeout(500);
await shot('product-after');
const home = await page.locator('.beliefs li').first().innerText();
step('Oreo home is now: ' + home.replace(/\n/g, ' '));
if (!home.includes('Endcap 6')) throw new Error('Reality Layer did not learn the correction');
await page.getByRole('button', { name: 'Close' }).click();
await page.getByRole('button', { name: 'Replay' }).click();
await page.waitForTimeout(1500);
await shot('time-machine');
step('time machine replay');

await page.getByRole('button', { name: 'Back' }).click();
await page.locator('.ask').click();
await page.getByRole('button', { name: "I've got ten minutes. What should I do?" }).click();
await page.locator('.plan-card').waitFor();
await page.waitForTimeout(600);
await shot('copilot');
step('copilot: ' + (await page.locator('.msg.os p').last().innerText()));
await page.getByRole('button', { name: /Start · ~/ }).click();
await expectText('NEXT');
await page.waitForTimeout(700);
await shot('copilot-route');
await page.getByRole('button', { name: 'End route' }).click();
await expectText('What are you doing?');

await page.locator('.lens-fab').click();
await expectText('Sweep Aisle');
for (let i = 0; i < 12 && !(await page.locator('.hud-title b').innerText()).endsWith(' 6'); i++) await page.locator('.hud-nav button').first().click();
await page.waitForTimeout(500);
await shot('lens');
await page.getByRole('button', { name: /Sweep Aisle/ }).click();
await expectText('swept');
await shot('lens-swept');
step('lens: ' + (await page.locator('.sweep-result').innerText()).replace(/\n/g, ' '));

await page.goto(URL + '#pulse');
await expectText('Area health');
await shot('pulse');
await page.goto(URL + '#find');
await page.getByPlaceholder(/Say or type/).fill('takis');
await shot('find');
await page.goto(URL + '#orders');
await page.getByRole('button', { name: /Start pick/ }).first().click();
await expectText('NEXT');
await shot('pick');

await page.setViewportSize({ width: 1440, height: 900 });
await page.goto(URL + '#home');
await page.waitForTimeout(500);
await shot('desktop');

await browser.close();
server.kill();
if (errors.length) {
  console.error('Console errors:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('E2E OK');
