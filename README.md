# TTB Alcohol Label Verifier

An AI-assisted prototype that helps TTB compliance agents verify alcohol beverage labels against the data submitted on a COLA application. An agent enters the application fields and uploads a photograph of the label; the app reads the label with a vision model, compares each regulated field against the application, and surfaces a clear **pass / review / fail** decision per field — all in well under the 5-second budget surfaced in the stakeholder interviews.

**Live demo:** <https://treasury-app-eosin.vercel.app>
**Repository:** <https://github.com/s85191939/Treasury-app>

![Single-label verification screen](docs/screenshots/single.png)

---

## Contents

1. [What it does](#what-it-does)
2. [Try it in 30 seconds](#try-it-in-30-seconds)
3. [Included test fixtures](#included-test-fixtures)
4. [Run it locally](#run-it-locally)
5. [Architecture](#architecture)
6. [How verification works](#how-verification-works)
7. [API reference](#api-reference)
8. [Model selection & measured latency](#model-selection--measured-latency)
9. [Design decisions, mapped to the interviews](#design-decisions-mapped-to-the-interviews)
10. [Limitations and known issues](#limitations-and-known-issues)
11. [Future work](#future-work)
12. [Deployment](#deployment)

---

## What it does

**Single-label mode**

1. Agent enters the COLA application fields (brand, class/type, ABV, net contents, producer, optional country of origin).
2. Agent uploads a label photo (JPEG / PNG / WebP / GIF, up to 8 MB).
3. The vision model extracts the same regulated fields from the label as printed.
4. A deterministic comparator compares the application to the extracted text and renders a per-field verdict, plus an overall **pass / review / fail**.
5. The Government Warning is checked strictly (27 CFR 16.21 wording, exact case on the `GOVERNMENT WARNING:` header). All other fields use case- and punctuation-tolerant fuzzy matching — so a label with `STONE'S THROW` and an application with `Stone's Throw` is a **Pass**, not a fail.

**Batch mode**

- Upload one CSV of applications (one row per label) plus the matching image files.
- The browser pairs them by filename and runs up to **4 verifications in parallel**, updating a results table live.
- Each row has a drill-down with the same per-field breakdown as single mode.

---

## Try it in 30 seconds

The live deployment is open. From <https://treasury-app-eosin.vercel.app>:

1. Click **Single label** (selected by default).
2. The form is pre-filled for the `OLD TOM DISTILLERY` sample.
3. Drop in `samples/old-tom.jpg` from this repo (or any of the included samples).
4. Hit **Verify label** — result appears in ~2-3s.

To see the **Batch** mode in action:

1. Click **Batch (CSV + images)**.
2. Click **Download sample CSV**, or upload [`samples/applications.csv`](samples/applications.csv).
3. Upload all three images from `samples/` (`old-tom.jpg`, `altered-warning.jpg`, `chateau-margaux.jpg`).
4. Hit **Verify all** — you should see two **Pass** and one **Fail** (the altered-warning label).

---

## Included test fixtures

The `samples/` folder contains three synthetic labels generated with a deterministic Python script ([`samples/generate.py`](samples/generate.py)), so reviewers can reproduce them and see what the system was tested against.

| File | Scenario | Expected outcome |
| --- | --- | --- |
| `old-tom.jpg` | Clean bourbon label, all required fields, canonical Government Warning | **Pass** on every field |
| `altered-warning.jpg` | Same as old-tom, but the warning header is in title case (`Government Warning:`) instead of all caps | **Fail** on the Government Warning, pass on everything else |
| `chateau-margaux.jpg` | Wine label with country of origin | **Pass** on every field (including the optional country-of-origin check) |

`samples/applications.csv` is a ready-to-go CSV for batch mode that pairs each image with its application data.

---

## Run it locally

Prerequisites: **Node 20+** and an [OpenRouter](https://openrouter.ai/) API key.

```bash
git clone https://github.com/s85191939/Treasury-app.git
cd Treasury-app
npm install
cp .env.example .env.local            # paste your OPENROUTER_API_KEY
npm run dev
# → open http://localhost:3000
```

Optional env vars (see [`.env.example`](.env.example)):

| Variable | Default | Notes |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | (required) | Your OpenRouter key |
| `OPENROUTER_MODEL` | `google/gemini-2.5-flash` | Any OpenRouter vision + tool-calling model |
| `OPENROUTER_BASE_URL` | `https://openrouter.ai/api/v1` | For self-hosted gateways |
| `OPENROUTER_HTTP_REFERER` | `http://localhost:3000` | Reported in OpenRouter analytics |

To regenerate the sample labels (requires `Pillow`):

```bash
pip install pillow
python3 samples/generate.py
```

---

## Architecture

```
                        ┌───────────────────────┐
                        │   Browser (Next.js)   │
                        │  /app/page.tsx        │
                        │   ├─ SingleVerifier   │
                        │   └─ BatchVerifier    │
                        └─────────────┬─────────┘
                                      │ multipart/form-data
                                      │ (image + application JSON)
                                      ▼
                        ┌───────────────────────┐
                        │  POST /api/verify     │
                        │  src/app/api/verify   │
                        └─────────────┬─────────┘
                                      │
                       ┌──────────────┼──────────────┐
                       ▼              ▼              ▼
                ┌───────────┐  ┌────────────┐ ┌───────────────┐
                │ extract() │  │ compare()  │ │ overallStatus │
                │ → fields  │  │ → results  │ │ → pass/fail   │
                └─────┬─────┘  └────────────┘ └───────────────┘
                      │
                      ▼
                ┌───────────────────────┐
                │  OpenRouter           │
                │  /chat/completions    │
                │  (tool-use, vision)   │
                └───────────────────────┘
```

```
src/
├─ app/
│  ├─ api/verify/route.ts     # POST endpoint — validates input, runs extract+compare
│  ├─ layout.tsx
│  ├─ globals.css
│  └─ page.tsx                # tabs: single | batch
├─ components/
│  ├─ SingleVerifier.tsx      # left: form+upload, right: results
│  ├─ BatchVerifier.tsx       # CSV+images, table with drill-down, 4-way parallel
│  ├─ VerificationResult.tsx  # per-field results table + reviewer-notes pane
│  └─ StatusBadge.tsx         # pass / fail / review / missing pills
└─ lib/
   ├─ extract.ts              # OpenRouter call (fetch + tool/function calling)
   ├─ compare.ts              # deterministic comparator + canonical warning text
   ├─ csv.ts                  # minimal RFC-ish CSV parser (handles quotes & commas)
   └─ types.ts                # LabelApplication, ExtractedLabel, FieldResult, VerifyResponse
```

### Request flow for one label

1. Browser packages the image + a JSON-encoded `LabelApplication` into a `FormData` and POSTs `/api/verify`.
2. The route validates content-type, size (≤ 8 MB), and the application JSON.
3. `extract.ts` base64-encodes the image, calls OpenRouter with a `report_label_fields` tool and `tool_choice` pinned to it — so the model can only respond by filling the schema.
4. The extracted fields are normalised (producer name + address joined, empty strings → `null`).
5. `compare.ts` runs deterministic, auditable checks per field and produces a `FieldResult[]`.
6. Overall status is `fail` if any field fails or is missing, `review` if anything is `warning`, else `pass`.
7. The response is `{ extracted, results, overall, latencyMs }`.

---

## How verification works

Vision models are good at reading text. They are **not** the right place to make a regulatory decision — that needs to be deterministic and auditable. So the model only does OCR-with-structure, and a pure-TypeScript comparator decides pass/fail.

### Per-field comparison

| Field | Strategy | Pass | Review | Fail |
| --- | --- | --- | --- | --- |
| Brand name | Normalised Levenshtein similarity | similarity = 1.0 | 0.85–0.99 | < 0.85 |
| Class / Type | Normalised Levenshtein similarity | similarity = 1.0 | 0.80–0.99 | < 0.80 |
| Alcohol Content | Parse `%` or `proof` (proof ÷ 2 = ABV), compare numerically | diff < 0.05% | 0.05 – 0.3% | > 0.3% |
| Net Contents | Parse `ml / L / cl / fl oz / oz`, normalise to mL | diff < 0.5 mL | within 2% of expected | otherwise |
| Producer / Bottler | Normalised Levenshtein similarity | sim = 1.0 | 0.80–0.99 | < 0.80 |
| Country of Origin (optional) | Normalised Levenshtein similarity | sim = 1.0 | 0.85–0.99 | < 0.85 |
| **Government Warning** | **Strict, case-sensitive header check + exact-string body match** | exact canonical match | ≥ 98% similar (likely OCR artefact) | otherwise, or header not `GOVERNMENT WARNING:` in caps |

Normalisation for fuzzy fields: lower-case, collapse whitespace, strip non-alphanumeric (except `% . / -`), unify curly quotes. This is what makes `STONE'S THROW` ≡ `Stone's Throw`.

### The Government Warning

Hardcoded canonical text from 27 CFR 16.21:

> GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.

Two layers of strictness:
1. The system prompt explicitly instructs the model to preserve original case verbatim and to set `warning_header_in_all_caps=false` if the printed header is in title case. The prompt warns the model that a downstream compliance check depends on the case.
2. The comparator does an independent check on the returned text (`startsWith("GOVERNMENT WARNING:")`, case-sensitive). The model only "passes" the warning if **both** its boolean and the actual text agree.

This belt-and-braces approach catches the case where a model would otherwise silently normalise the case in its OCR output.

---

## API reference

### `POST /api/verify`

**Request:** `multipart/form-data`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `image` | `File` | yes | `image/jpeg`, `image/png`, `image/webp`, or `image/gif`, ≤ 8 MB |
| `application` | string (JSON) | yes | Encoded [`LabelApplication`](src/lib/types.ts) |

`LabelApplication`:

```ts
{
  brandName: string,           // required
  classType: string,           // required
  alcoholContent: string,      // required, e.g. "45% Alc./Vol." or "90 Proof"
  netContents: string,         // required, e.g. "750 mL"
  producer: string,            // required
  originCountry?: string,      // optional — only checked if provided
  beverageClass?: "spirits" | "wine" | "beer" | "unknown"
}
```

**Response (200):** `VerifyResponse`

```ts
{
  extracted: ExtractedLabel,       // raw fields the model read from the label
  results: FieldResult[],          // per-field comparison with status + note
  overall: "pass" | "fail" | "review",
  latencyMs: number                // server-measured end-to-end latency
}
```

**Errors:**

| Code | Meaning |
| --- | --- |
| `400` | Missing image, missing or invalid application JSON, malformed form |
| `413` | Image > 8 MB |
| `415` | Unsupported image MIME type |
| `500` | Missing `OPENROUTER_API_KEY`, upstream OpenRouter failure, or tool-call parsing error |

**Example:**

```bash
curl -s -X POST https://treasury-app-eosin.vercel.app/api/verify \
  -F 'application={"brandName":"OLD TOM DISTILLERY","classType":"Kentucky Straight Bourbon Whiskey","alcoholContent":"45% Alc./Vol.","netContents":"750 mL","producer":"Old Tom Distillery, Bardstown, KY"}' \
  -F "image=@samples/old-tom.jpg"
```

---

## Model selection & measured latency

Measured end-to-end (curl → `/api/verify` → OpenRouter → response) against the `old-tom.jpg` sample, three runs averaged, from a residential macOS box. Numbers move around in the network; treat them as orders of magnitude.

| Model | Avg latency | Notes |
| --- | --- | --- |
| `google/gemini-2.5-flash` (default) | **~2.4 s** | Comfortably inside Sarah's 5 s budget; reliable tool-use. Recommended. |
| `anthropic/claude-haiku-4.5` | ~3.5 s | Very accurate, slightly slower. |
| `anthropic/claude-sonnet-4.5` | ~5.6 s | Highest fidelity, but borderline against the 5 s budget. |
| `openai/gpt-4o` | varies | Solid OCR, latency depends on routing. |

Swap by setting `OPENROUTER_MODEL` — no code change. The tool/function-call schema is in OpenAI-compatible form, so any major provider supported by OpenRouter works.

---

## Design decisions, mapped to the interviews

| Decision | Why, and which interview note it ties to |
| --- | --- |
| **Next.js + TypeScript + Tailwind on Vercel** | One repo, one deploy target, no separate API server to operate. Marcus stressed the pain of FedRAMP / .NET / firewall procurement — a stateless app with one outbound call is the easiest thing to argue for in a follow-up. |
| **No COLA integration** | Marcus said the prototype is explicitly standalone. Everything is in-memory; the only egress is the OpenRouter API. |
| **OpenRouter** | Single API key for many models — lets reviewers swap providers without code changes if their network or policy prefers one. Reduces vendor lock-in for a future procurement. |
| **`google/gemini-2.5-flash` default** | Sarah: *"If we can't get results back in about 5 seconds, nobody's going to use it."* Gemini Flash measures ~2.4 s end-to-end, with margin. Stronger models are one env var away. |
| **Tool/function calling for structured output** | The model can only respond by filling the `report_label_fields` schema — no JSON-in-markdown parsing, no prose to strip, no schema drift between requests. |
| **Deterministic comparator (TypeScript), not "ask the model to decide"** | Regulatory decisions need to be auditable and reproducible. The same expected/found pair will always produce the same status. The model is restricted to reading text; the law is enforced by code. |
| **Fuzzy match for names, strict for the Government Warning** | Dave's STONE'S THROW vs Stone's Throw example: that should be **Pass**, not Fail. Jenny's `GOVERNMENT WARNING:` vs `Government Warning:` example: that **must** be Fail. Both behaviours are covered explicitly. |
| **Numeric tolerance for ABV (0.05% / 0.3%) and volume (0.5 mL / 2%)** | Bottling and OCR introduce rounding. A label that reads `45.0%` vs an application that says `45%` should clearly pass; a label that reads `12%` against an application of `12.5%` is a review case worth eyeballing. |
| **Two-layer Government Warning check** | The system prompt instructs the model to preserve case and report `warning_header_in_all_caps` honestly, **and** the comparator does its own case-sensitive `startsWith` check on the returned text. Either disagreement = fail. |
| **Batch via CSV + image files, paired by filename** | Janet's request from the Seattle office. Concurrency capped at 4 for safety with rate limits; the UI streams updates per row so an agent isn't staring at a frozen progress bar during peak season. |
| **Clean, unambiguous UI — two tabs, sample data pre-filled** | Sarah: *"My mother could figure it out"* (73-year-old, learned to video call last year). Big buttons, no hidden state, every field labelled, no jargon beyond what's already on a COLA. |
| **Reviewer-notes field surfaced from the model** | Jenny's wish: handle bad photos. When the model is uncertain (angled, glare, occlusion) it can write a free-text note. The UI shows it as a yellow callout so an agent can request a re-shoot rather than chasing a phantom violation. |
| **No persistence at all** | Marcus: *"Just don't do anything crazy. We're not storing anything sensitive for this exercise."* Images and form data live for the duration of the request, then go away. No PII in logs. |

---

## Limitations and known issues

- **Vision OCR accuracy is the floor of the system.** The comparator is deterministic, but if the model misreads a number, the verdict is wrong. The `notes` field is the safety valve.
- **OpenRouter must be reachable.** Marcus warned about TTB's outbound firewalls; in a real deployment the production network would need an allowlist for `openrouter.ai` (or swap to a direct provider that's already approved, e.g. Bedrock in GovCloud).
- **Canonical warning text is hardcoded.** It's the current 27 CFR 16.21 wording. A real deployment would version this and pull from a managed source.
- **Batch concurrency is capped at 4** to stay friendly to typical OpenRouter rate limits. Production should queue, retry, and back off on 429s.
- **CSV pairing is by filename, case-sensitive.** Simple and predictable, but not forgiving — `Foo.jpg` and `foo.jpg` won't match. Production would pull straight from COLA application records.
- **No authentication.** Per Marcus's "standalone proof-of-concept" framing. Production would sit behind agent SSO.
- **No automated tests.** The comparator is the obvious place to add unit tests if this goes further — `compare.ts` is pure, deterministic, and trivially testable. The extractor would need a fixture set of labels (real or synthesised).
- **Single-page app, no URL state.** Tab choice is `useState`, not URL — so sharing a "batch mode" link doesn't pre-select the tab. Out of scope here, easy to add.

---

## Future work

Order roughly by *impact-per-hour-of-engineering*:

1. **Unit tests on `compare.ts`** with table-driven fixtures for ABV/volume/case-edge inputs.
2. **CSV export of batch results** for an agent to drop into their existing queue tracker.
3. **A "needs re-photograph" workflow** — when the model emits a `notes` field, surface a dedicated reject reason that auto-fills the agent's standard request-for-better-image message.
4. **Versioned canonical warning + class-type taxonomy**, loaded from a small server-side config so legal can update without a deploy.
5. **Retry with a stronger model on `review` outcomes** — keep Flash for the cheap fast pass, escalate to Sonnet/GPT-4o only for borderline cases.
6. **Side-by-side image viewer** with zoom + boxes drawn around the extracted fields so the agent can visually confirm what the model "saw".
7. **Throughput tuning for 200-300 label peak-season batches** — server-side queue, per-customer concurrency, OCR cost budget per upload.
8. **Auditability** — append-only log of every verification (image hash, application data, extracted fields, verdict, model name, timestamp) for downstream COLA reconciliation.

---

## Deployment

The live deployment is on Vercel at <https://treasury-app-eosin.vercel.app>.

To deploy your own copy:

1. Fork or import this repository on Vercel ([vercel.com/new](https://vercel.com/new)).
2. Add `OPENROUTER_API_KEY` (and optionally `OPENROUTER_MODEL`) under **Project Settings → Environment Variables**.
3. Deploy. No build configuration required — Vercel auto-detects Next.js.

Or from this directory with the Vercel CLI:

```bash
vercel link
echo "$OPENROUTER_API_KEY" | vercel env add OPENROUTER_API_KEY production
vercel deploy --prod
```
