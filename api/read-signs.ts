// POST /api/read-signs — reads photos of a grocery store's signs and returns its layout.
// Runs on Vercel. Needs the ANTHROPIC_API_KEY environment variable (Vercel → Project → Settings → Environment Variables).

import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';

const StoreLayout = z.object({
  storeName: z.string().describe('Store/chain name if a photo shows it, else empty string'),
  aisles: z
    .array(
      z.object({
        number: z.number().int().describe('Aisle number printed on the sign'),
        name: z.string().describe('Short summary of the categories, e.g. "Chips · Soda · Water"'),
        categories: z.array(z.string()).describe('Each category listed on the sign, as written'),
        frozen: z.boolean().describe('True if the sign says frozen/freezer or lists only frozen foods'),
      }),
    )
    .describe('One entry per distinct aisle number seen'),
  departments: z.array(z.string()).describe('Perimeter departments seen on signs: Produce, Bakery, Deli, Meat, Seafood, Dairy, Pharmacy, Floral, etc.'),
  unreadable: z.number().int().describe('How many photos had no readable sign'),
});
export type StoreLayout = z.infer<typeof StoreLayout>;

const PROMPT = `These are photos a store employee took while walking a grocery store to set up a store-map app.
Most are hanging aisle signs (a number plus the categories in that aisle); some may be department signs or the storefront.
Read every sign. Merge duplicates: the same aisle is often photographed from both ends or twice.
Keep category text as printed, fixing only obvious casing. If an aisle number is ambiguous or unreadable, leave that aisle out rather than guessing.`;

const MAX_PHOTOS = 12;
const client = new Anthropic();

export async function POST(req: Request): Promise<Response> {
  if (!process.env.ANTHROPIC_API_KEY) return json({ error: 'The server has no ANTHROPIC_API_KEY set.' }, 503);
  let photos: string[];
  try {
    const body = (await req.json()) as { photos?: unknown };
    photos = Array.isArray(body.photos) ? body.photos.filter((p): p is string => typeof p === 'string') : [];
  } catch {
    return json({ error: 'Expected JSON: { photos: [base64 JPEG, ...] }' }, 400);
  }
  if (photos.length === 0) return json({ error: 'No photos' }, 400);
  if (photos.length > MAX_PHOTOS) return json({ error: `Send at most ${MAX_PHOTOS} photos per request` }, 413);

  const content: Anthropic.Beta.BetaContentBlockParam[] = [
    ...photos.map((data) => ({
      type: 'image' as const,
      source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data: data.replace(/^data:image\/\w+;base64,/, '') },
    })),
    { type: 'text', text: PROMPT },
  ];

  try {
    const message = await client.beta.messages.parse({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      output_config: { effort: 'low', format: betaZodOutputFormat(StoreLayout) },
      // If a safety classifier declines, the API retries on a fallback model instead of failing.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      messages: [{ role: 'user', content }],
    });
    if (message.stop_reason === 'refusal') return json({ error: 'The model declined to read these photos.' }, 422);
    if (message.stop_reason === 'max_tokens' || !message.parsed_output) return json({ error: 'Could not read the signs. Try fewer or clearer photos.' }, 502);
    return json(message.parsed_output, 200);
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return json({ error: 'Busy — try again in a minute.' }, 429);
    if (err instanceof Anthropic.AuthenticationError) return json({ error: 'The server’s Anthropic API key is invalid.' }, 503);
    if (err instanceof Anthropic.BadRequestError) return json({ error: `Bad request: ${err.message}` }, 400);
    if (err instanceof Anthropic.APIError) return json({ error: `Claude API error ${err.status}` }, 502);
    return json({ error: 'Network error reaching Claude' }, 502);
  }
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}
