// E2E for "Snap my store": pick sign photos → (mocked) /api/read-signs → review → store created.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const OUT = process.env.SHOTS ?? 'e2e-shots/snap';
mkdirSync(OUT, { recursive: true });
const PORT = String(4400 + Math.floor(Math.random() * 500));
const URL = `http://localhost:${PORT}/`;
const server = spawn('npx', ['vite', 'preview', '--port', PORT, '--strictPort'], { stdio: 'pipe' });
process.on('exit', () => server.kill());
await new Promise((r) => server.stdout.on('data', (d) => String(d).includes(PORT) && r()));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

// Render a few fake hanging aisle signs to JPEGs
const signs = [
  [3, 'Baking · Spices · Oil'],
  [6, 'Chips · Soda · Water'],
  [6, 'Chips · Salsa'],
  [9, 'Frozen Pizza · Ice Cream'],
];
const files = [];
{
  const p = await browser.newPage({ viewport: { width: 640, height: 400 } });
  for (const [i, [n, text]] of signs.entries()) {
    await p.setContent(`<body style="margin:0;background:#dfe6ea;display:grid;place-items:center;height:100vh;font-family:sans-serif">
      <div style="background:#0b4f8a;color:#fff;padding:24px 40px;border-radius:10px;text-align:center"><div style="font-size:90px;font-weight:900">${n}</div><div style="font-size:30px">${text}</div></div></body>`);
    const f = `${OUT}/sign-${i}.jpg`;
    writeFileSync(f, await p.screenshot({ type: 'jpeg' }));
    files.push(f);
  }
  await p.close();
}

const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
let calls = 0;
let photosSent = 0;
await page.route('**/api/read-signs', async (route) => {
  calls++;
  const body = JSON.parse(route.request().postData() ?? '{}');
  photosSent += body.photos.length;
  if (!body.photos.every((p) => p.startsWith('data:image/jpeg;base64,'))) return route.fulfill({ status: 400, body: '{"error":"bad photo"}' });
  await new Promise((r) => setTimeout(r, 400));
  route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      storeName: 'Test Foods',
      aisles: [
        { number: 3, name: 'Baking · Spices · Oil', categories: ['Baking', 'Spices', 'Oil'], frozen: false },
        { number: 6, name: 'Chips · Soda · Water', categories: ['Chips', 'Soda', 'Water'], frozen: false },
        { number: 6, name: 'Chips · Salsa', categories: ['Chips', 'Salsa'], frozen: false },
        { number: 9, name: 'Frozen Pizza · Ice Cream', categories: ['Frozen Pizza', 'Ice Cream'], frozen: true },
      ],
      departments: ['Deli', 'Bakery'],
      unreadable: 0,
    }),
  });
});
let n = 0;
const shot = (name) => page.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-${name}.png` });
const see = (t) => page.getByText(t, { exact: false }).first().waitFor({ timeout: 6000 });
try {
  await page.goto(URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await shot('choose');
  await page.getByRole('button', { name: /Snap my store/ }).click();
  await page.locator('input[type=file][multiple]').setInputFiles(files);
  await page.locator('.snap-thumb').nth(3).waitFor();
  await shot('photos');
  await page.getByRole('button', { name: /Build my store from 4 photos/ }).click();
  await see('Here’s your store');
  await shot('review');
  console.log('• read:', (await page.locator('.read-summary').innerText()).replace(/\n/g, ' | '));
  if ((await page.getByPlaceholder('e.g. Safeway').inputValue()) !== 'Test Foods') throw new Error('store name not prefilled');
  const names = page.getByPlaceholder(/What’s in it/);
  if ((await names.count()) !== 9) throw new Error('expected 9 aisles, got ' + (await names.count()));
  if ((await names.nth(5).inputValue()) !== 'Chips · Soda · Water · Salsa') throw new Error('aisle 6 name wrong');
  await page.getByRole('button', { name: /create my store/ }).click();
  await see('Teach StoreOS your store');
  const cfg = await page.evaluate(() => JSON.parse(localStorage.getItem('storeos.config')));
  console.log('• config:', JSON.stringify({ name: cfg.name, aisles: cfg.aisles, frozen: cfg.frozen, a6: cfg.aisleNames[6] }));
  if (cfg.aisles !== 9 || cfg.frozen.join() !== '9' || cfg.mode !== 'real') throw new Error('config wrong');
  await page.waitForTimeout(500);
  await shot('home');

  // Error path: the server has no key
  await page.unroute('**/api/read-signs');
  await page.route('**/api/read-signs', (r) => r.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"The server has no ANTHROPIC_API_KEY set."}' }));
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: /Snap my store/ }).click();
  await page.locator('input[type=file][multiple]').setInputFiles(files.slice(0, 1));
  await page.getByRole('button', { name: /Build my store/ }).click();
  await see('no ANTHROPIC_API_KEY');
  await shot('error');
  await page.getByRole('button', { name: 'Type it instead' }).click();
  await see('Numbered aisles');
  console.log(`• error path OK · ${calls} API calls, ${photosSent} photos sent`);
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
if (!process.exitCode) console.log('E2E SNAP OK');
