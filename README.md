# TTB Alcohol Label Verifier

A prototype that helps TTB compliance agents verify alcohol beverage labels against COLA application data. An agent uploads a label image plus the application fields; the app extracts the regulated fields from the image with Claude vision, compares them to the application, and surfaces a clear pass / review / fail decision in seconds.

> Built as a take-home prototype. No data is persisted. The goal is to make a believable case for what an agent's day could look like, not a production system. Vision/OCR runs through [OpenRouter](https://openrouter.ai/) so the underlying model is swappable.

## What it does

**Single-label mode**
- Agent types the application fields (brand, class/type, ABV, net contents, producer, optional country of origin).
- Uploads a label photo (JPEG / PNG / WebP, up to 8 MB).
- Claude reads the label and reports back the same fields as printed.
- A deterministic comparator decides pass / review / fail per field. The Government Warning is checked strictly; brand and producer use fuzzy matching so casing or punctuation drift becomes a *Review*, not a *Fail*.

**Batch mode**
- Upload a CSV of applications (one row per label) plus the matching image files.
- Up to 4 verifications run in parallel; the table fills in live and rows show pass/review/fail with drill-down details.

## Why these choices

| Decision | Reason |
| --- | --- |
| **Next.js + TypeScript + Tailwind** | One repo, one deploy target (Vercel), no separate API server to operate. The interview notes emphasise government infra and firewalled networks — a stateless app with one outbound call is the easiest thing to procure later. |
| **Vision model via OpenRouter** | One API key, easy to swap models without touching code. Defaults to `anthropic/claude-sonnet-4.5` — strong OCR even on imperfect images (Jenny's wish-list item) and reliable tool/function calling for structured output. Sonnet keeps the round-trip well inside the 5-second budget Sarah said is non-negotiable; `OPENROUTER_MODEL` swaps in `anthropic/claude-haiku-4.5`, `google/gemini-2.5-flash`, or `openai/gpt-4o` without code changes. |
| **Tool/function calling for structured output** | The model can only respond by filling the `report_label_fields` schema. No JSON parsing roulette, no markdown-fenced JSON, no prose to strip. |
| **Deterministic comparator, not "ask the model to decide"** | The model is good at reading text. Deciding *pass* vs *fail* is a regulatory judgement and needs to be auditable and reproducible. Levenshtein-based similarity for names, parsed numeric tolerance for ABV (0.05% / 0.3%) and net contents (~0.5 mL), and an exact-text check for the Government Warning. |
| **Fuzzy by default, strict on the warning** | Directly responds to Dave's "STONE'S THROW" vs "Stone's Throw" example *and* Jenny's "Government Warning" vs "GOVERNMENT WARNING:" example. Surface a *Review* instead of a *Fail* when fields match semantically but differ in formatting. |
| **No COLA / database integration** | Marcus said the prototype is explicitly standalone. Everything is in-memory; the only egress is the Anthropic API. |

## Running locally

Prerequisites: Node 20+ and an [OpenRouter](https://openrouter.ai/) API key.

```bash
npm install
cp .env.example .env.local   # paste your OPENROUTER_API_KEY
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Batch CSV format

```csv
filename,brand_name,class_type,alcohol_content,net_contents,producer,origin_country
old-tom.jpg,OLD TOM DISTILLERY,Kentucky Straight Bourbon Whiskey,45% Alc./Vol.,750 mL,"Old Tom Distillery, Bardstown, KY",
chateau-margaux.jpg,Chateau Margaux,Bordeaux Red Wine,13% ABV,750 mL,"Chateau Margaux, Margaux, France",France
```

`origin_country` is optional. The first six columns are required. Image filenames must match exactly (case-sensitive) when you select the image files.

Download a starter file from the batch screen's "Download sample CSV" link.

## Project layout

```
src/
|- app/
|  |- api/verify/route.ts     # POST /api/verify -- extracts + compares one label
|  |- layout.tsx
|  +- page.tsx                # single vs batch tabs
|- components/
|  |- SingleVerifier.tsx
|  |- BatchVerifier.tsx
|  |- VerificationResult.tsx
|  +- StatusBadge.tsx
+- lib/
   |- extract.ts              # OpenRouter vision call (fetch + tool-use)
   |- compare.ts              # deterministic comparator + canonical warning
   |- csv.ts                  # minimal CSV parser (handles quotes / commas)
   +- types.ts
```

## Assumptions & known trade-offs

- **OpenRouter API is reachable.** Marcus warned about firewalls; in production this would need an allowlist for `openrouter.ai` (or swap to a direct provider). Documented, not solved here.
- **Government Warning text is the current 27 CFR 16.21 wording.** Hardcoded in `lib/compare.ts`. A real deployment would version this.
- **Batch concurrency is capped at 4** to stay friendly to typical Anthropic rate limits. Production should queue and back off on 429s.
- **No authentication.** Standalone proof-of-concept per Marcus's note. PII handling is also out of scope -- images are never persisted.
- **CSV-by-filename matching** is the simplest pairing UI; production would pull straight from COLA.
- **Image quality.** Jenny mentioned angled / glare photos. Claude's vision handles a lot of this transparently; the extractor returns a `notes` field surfaced to the agent when the model is unsure.
- **No automated tests in the prototype.** The comparator is the right place for unit tests if this goes further; the extractor would need a fixture set of labels.

## Deploying

The app is a vanilla Next.js project. Easiest path: push to GitHub and import the repo in Vercel, then set `OPENROUTER_API_KEY` (and optionally `OPENROUTER_MODEL`) in project env vars. No other configuration is required.
