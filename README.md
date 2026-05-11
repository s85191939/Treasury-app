# TTB Alcohol Label Verifier

An AI-assisted prototype that helps TTB compliance agents verify alcohol beverage labels against the data submitted on a COLA application. The agent enters the application fields and uploads a photograph of the label; the app reads the label with a vision model, applies beverage-type-aware compliance rules, and surfaces a clear **pass / review / fail** verdict per field — in well under the 5-second budget the stakeholder interviews said was non-negotiable.

**Live demo:** <https://treasury-app-eosin.vercel.app>
**Repository:** <https://github.com/s85191939/Treasury-app>

### What you're looking at

The agent's screen has two tabs:

| Single label | Batch (CSV + images) |
| --- | --- |
| ![Pass result](docs/screenshots/result-pass.png) | ![Batch results](docs/screenshots/batch-results.png) |

A failed label looks like this — each rule the verifier failed is called out with a plain-language note next to the field:

![Fail result on a label with a title-case 'Government Warning:' header](docs/screenshots/result-fail-case.png)

### Three-minute summary

1. **The work today is mostly comparison.** Sarah Chen's team checks ~150 000 COLA applications a year. Most of the time is spent making sure the brand name, ABV, net contents, and Government Warning on the label match the form. The interviews described it as *"essentially data entry verification."*
2. **The prototype does that comparison automatically.** An agent enters the COLA data, uploads the label photograph, and gets a per-field verdict in ~2-3 seconds. The Government Warning is checked strictly (canonical wording + all-caps header + bold weight). Brand, producer, and class type use fuzzy matching so a label with `STONE'S THROW` still matches an application of `Stone's Throw` — exactly the *judgment* Dave said the old vendor's pattern-matcher couldn't do.
3. **It's a thin client with one outbound call.** No COLA integration, no database, no persisted PII — Marcus's pre-conditions. Vision/OCR is routed through [OpenRouter](https://openrouter.ai/), so the underlying model is swappable without code changes.
4. **The regulatory decision is deterministic code, not the model.** The model only extracts text from the image. A pure-TypeScript comparator in `src/lib/compare.ts` applies the rules, and **79 unit tests** + **5 end-to-end browser tests** (84 total) pin every rule — including TTB Standards of Fill — so a future change can't silently break a compliance behaviour. Tests run against **22 fixtures**: synthetic, AI-generated, and real-photo community labels.

---

## Contents

1. [What it does](#what-it-does)
2. [Spec coverage at a glance](#spec-coverage-at-a-glance)
3. [Try the live demo](#try-the-live-demo)
4. [Included test fixtures](#included-test-fixtures)
5. [Run it locally](#run-it-locally)
6. [Architecture](#architecture)
7. [How verification works](#how-verification-works)
8. [API reference](#api-reference)
9. [Model selection & measured latency](#model-selection--measured-latency)
10. [Design decisions, mapped to the interviews](#design-decisions-mapped-to-the-interviews)
11. [Testing](#testing)
12. [Limitations and known issues](#limitations-and-known-issues)

---

## What it does

**Single-label mode**

1. Agent picks the beverage type (spirits / wine / beer) and enters the COLA application fields (brand, class/type, ABV, net contents, producer, optional country of origin).
2. Agent uploads a label photo (JPEG / PNG / WebP / GIF, up to 8 MB) — click or drag-and-drop.
3. The vision model extracts every regulated field as printed, classifies the beverage, and reports whether the Government Warning header is in **all-caps** and **bold**.
4. A deterministic comparator applies beverage-type-specific rules (e.g. wines under 14% can omit ABV; missing ABV on a beer is not required at the federal level) and renders a per-field verdict plus an overall pass / review / fail.
5. The Government Warning is checked strictly: exact canonical 27 CFR 16.21 text, header in all caps, header in bold. All three signals must agree. Other fields use fuzzy matching, so `STONE'S THROW` on a label still matches `Stone's Throw` on the application.
6. If the model flags the image as low-quality (angle, glare, occlusion) the UI surfaces that as a *Reviewer note* with a suggested "request a better photo" action.

**Batch mode**

- Upload one CSV of applications (one row per label) plus the matching image files. Filename pairing.
- Up to **4 verifications run in parallel**; rows update live ("3 of 12 verified") with pass/review/fail badges.
- Filter the table by status (All / Pass / Review / Fail), expand any row for the full breakdown, retry any failed row, and **export the results to CSV** ready for COLA reconciliation.

---

## Spec coverage at a glance

Every requirement called out in the briefing doc and the four stakeholder interviews is wired up. Below is a direct mapping. Each row links to the implementation.

### Regulated label fields (TTB)

| Field | Implementation |
| --- | --- |
| Brand name | Fuzzy compare in [`compare.ts`](src/lib/compare.ts) |
| Class / type designation | Fuzzy compare in [`compare.ts`](src/lib/compare.ts) |
| Alcohol content — with exceptions for wine/beer | Numeric tolerance + per-beverage-type exemption rules in [`compare.ts`](src/lib/compare.ts) |
| Net contents | Multi-unit parser (mL / L / cL / fl oz) in [`compare.ts`](src/lib/compare.ts) |
| Bottler / producer + address | Fuzzy compare on concatenated name+address |
| Country of origin (imports) | Optional fuzzy compare, shown only when the application sets it |
| Government Warning (mandatory) | Strict canonical-text + caps + bold check in [`compare.ts`](src/lib/compare.ts) |

### Stakeholder interview points

| Stakeholder ask | Implementation |
| --- | --- |
| Sarah: results in **~5 seconds** or nobody uses it | Default model is `google/gemini-2.5-flash`, measured ~2.4 s end-to-end |
| Sarah: **batch uploads** (peak-season 200–300) | Batch mode with 4-way parallel, filter, retry, CSV export |
| Sarah: UI my mother (73) could figure out | Big buttons, two tabs, sample data pre-filled, drag-and-drop with hover state, plain-language errors, live progress indicators |
| Marcus: **standalone prototype**, no COLA integration | Stateless Next.js app, single egress to OpenRouter |
| Marcus: **no PII storage** | Nothing persists; images live for the request lifetime then go away |
| Marcus: **firewall** considerations | One outbound host (`openrouter.ai`) — documented, `OPENROUTER_BASE_URL` overrideable for a gateway/proxy |
| Dave: **STONE'S THROW vs Stone's Throw** judgment | Normalised Levenshtein similarity for names — case + punctuation tolerant |
| Dave: don't make life harder | Two-click verification, instant feedback, sample CSV download |
| Jenny: warning must be **exact, all caps, bold** | Triple check: canonical text + `warning_header_in_all_caps` + `warning_header_is_bold`, all required |
| Jenny: handle **imperfect images** | Model has explicit guidance to flag image-quality issues via the `notes` field; UI surfaces them prominently |

### Deliverables checklist

- [x] Source code repository — <https://github.com/s85191939/Treasury-app>
- [x] README with setup and run instructions — this file
- [x] Brief documentation of approach, tools, assumptions — this file
- [x] Deployed application URL — <https://treasury-app-eosin.vercel.app>
- [x] Unit tests — 34 tests in [`compare.test.ts`](src/lib/compare.test.ts), `npm test`

---

## Try the live demo

The live deployment is open. From <https://treasury-app-eosin.vercel.app>:

1. Click **Single label** (selected by default).
2. The form is pre-filled for the `OLD TOM DISTILLERY` sample (a distilled spirits label).
3. Download [`samples/old-tom.jpg`](samples/old-tom.jpg) from the repo (or drag-drop it from your machine).
4. Hit **Verify label** — result appears in ~2-3 s.

To exercise the strict warning check:

1. Same flow, but upload [`samples/altered-warning.jpg`](samples/altered-warning.jpg). It looks almost identical, but the Government Warning header is in title case (`Government Warning:`) instead of caps.
2. The result is **Fail**, with the Government Warning row showing two red badges — `ALL CAPS` and (in some models) `Bold weight` — and a plain-language note: *"Header is not 'GOVERNMENT WARNING:' in all caps — TTB requires exact format."*

To exercise batch + beverage-type rules:

1. Click **Batch (CSV + images)**.
2. Click **Download sample CSV** (or upload [`samples/applications.csv`](samples/applications.csv)).
3. Upload all three images from `samples/` (`old-tom.jpg`, `altered-warning.jpg`, `chateau-margaux.jpg`).
4. Hit **Verify all** — two **Pass**, one **Fail**. Click **Export results CSV** to take the verdicts back to COLA.

---

## Included test fixtures

The `samples/` folder ships **22 test fixtures** across two sources:

- **8 deterministic synthetic labels** under `samples/*.jpg`, generated by [`samples/generate.py`](samples/generate.py). Each one exercises a specific rule (pass scenarios, strict-warning fails, ABV exemption boundaries).
- **1 AI-generated label** (`samples/riverstone-ai.jpg`) made via OpenRouter's `google/gemini-2.5-flash-image` — closes the spec's *"AI image generation tools work well for this"* line. The generator produced typos in the warning text which the verifier correctly catches.
- **13 photorealistic community fixtures** under `samples/community/*.jpg` — bottle-photograph quality labels generated through ChatGPT by [Faheem Syed (fsyeddev)](https://github.com/fsyeddev/ttb-label) and re-shared here under the same evaluation context. Includes pass, mismatch, and non-compliance scenarios with paired JSON metadata.

### Synthetic fixtures (rule unit-coverage)

#### Pass scenarios

| File | Scenario | What it proves |
| --- | --- | --- |
| `old-tom.jpg` | Clean bourbon label, all required fields, canonical Government Warning in bold all-caps | Happy-path spirits verification |
| `chateau-margaux.jpg` | Wine label with country of origin | Optional country-of-origin check + wine beverage classification |
| `wine-low-abv.jpg` | Chardonnay at 12.5% with ABV present | Wine ABV is checked when displayed |
| `wine-low-abv-missing.jpg` | Same Chardonnay, ABV omitted from the label | **Wine-under-14% exemption** — N/A status, doesn't block pass |
| `beer-ipa.jpg` | West Coast IPA at 6.8% | **Beer ABV exemption** + beer beverage classification |

#### Fail / review scenarios

| File | Scenario | Verdict | What it proves |
| --- | --- | --- | --- |
| `altered-warning.jpg` | Warning header in title case (`Government Warning:`) | **Fail** | Strict caps check on the warning header |
| `regular-warning.jpg` | Warning header all-caps but **regular weight** (not bold) | **Review** | Bold check exists — but flagged as review rather than fail because real-photo bold detection is the noisiest model signal (see [the bold-rule rationale](#government-warning--the-bold-rule-rationale) below) |
| `wrong-abv.jpg` | Label says 50% ABV, application says 45% | **Fail** | ABV numeric tolerance flags real mismatches |
| `riverstone-ai.jpg` | AI-generated label (Gemini 2.5 Flash Image via OpenRouter) — the generator produced typos: `GOVERIMENT WARNING:`, `alconic beverages` | **Fail** | Real-world OCR test on an AI image — the verifier catches the typo'd warning header. The spec encouraged AI labels; this one closes that loop. |

### Community fixtures (real-photo realism)

Photorealistic labels from [fsyeddev/ttb-label](https://github.com/fsyeddev/ttb-label) — credit to **Faheem Syed** for the day he spent crafting them through ChatGPT. They sit under `samples/community/` and exercise scenarios our synthetic suite can't: full bottle photographs, depth-of-field, real shadows.

| Bucket | Fixtures | Outcome |
| --- | --- | --- |
| Pass (legitimate labels) | `01-pass-01` … `01-pass-03` | 2 pass, 1 review (bold confidence on a small warning) |
| JSON ↔ label mismatch | `02-mismatch-01` … `02-mismatch-05` | **5 / 5 catch the exact field Faheem's metadata expected** (brand, class, ABV, net contents, bottler) |
| TTB non-compliance | `03-noncompliant-01` … `03-noncompliant-05` | 1/5 caught directly (`03-noncompliant-01`, Standards of Fill — see below). The other 4 (missing age statement, missing composition statement, missing state of distillation, non-standard phrasing) come up as **review** rather than auto-passing — they're flagged for an agent rather than rubber-stamped. Implementing each as a dedicated check is the natural next milestone. |

`samples/applications.csv` pairs every synthetic image with its application data — drop the whole folder into batch mode and watch the verdicts come back live.

To regenerate the labels (requires `Pillow`):

```bash
pip install pillow
python3 samples/generate.py
```

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

Run the test suite:

```bash
npm test                # 79 unit tests, ~215ms
npm run test:watch      # vitest watch mode
npm run test:e2e        # 5 playwright tests against the live deployment, ~25s
npm run test:e2e:local  # same, but against http://localhost:3000
npm run test:all        # unit + e2e in one shot
```

Optional env vars (see [`.env.example`](.env.example)):

| Variable | Default | Notes |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | (required) | Your OpenRouter key |
| `OPENROUTER_MODEL` | `google/gemini-2.5-flash` | Any OpenRouter vision + tool-calling model |
| `OPENROUTER_BASE_URL` | `https://openrouter.ai/api/v1` | For gateways/proxies |
| `OPENROUTER_HTTP_REFERER` | `http://localhost:3000` | Reported in OpenRouter analytics |

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
│  ├─ SingleVerifier.tsx      # left: form+upload, right: results, drag-drop, progress
│  ├─ BatchVerifier.tsx       # CSV+images, table, filters, retry, CSV export, 4× parallel
│  ├─ VerificationResult.tsx  # per-field results, ALL CAPS/Bold badges, reviewer notes
│  └─ StatusBadge.tsx         # pass / fail / review / missing / n/a pills with icons
└─ lib/
   ├─ extract.ts              # OpenRouter call (fetch + tool/function calling)
   ├─ extract.test.ts         # 7 integration tests, fetch mocked
   ├─ compare.ts              # deterministic comparator + canonical warning text
   ├─ compare.test.ts         # 55 vitest unit tests
   ├─ csv.ts                  # minimal RFC-ish CSV parser
   ├─ csv.test.ts             # 11 vitest tests
   └─ types.ts                # LabelApplication, ExtractedLabel, FieldResult, VerifyResponse

e2e/
└─ live.spec.ts               # 4 Playwright tests against the live deployment

samples/
├─ generate.py                # deterministic generator for 8 of 9 fixtures
├─ applications.csv           # batch input pairing each fixture to its application data
├─ old-tom.jpg                # PASS — clean spirits label
├─ chateau-margaux.jpg        # PASS — wine + country of origin
├─ wine-low-abv.jpg           # PASS — wine 12.5% with ABV
├─ wine-low-abv-missing.jpg   # PASS — wine 12.5% ABV omitted (TTB exemption)
├─ beer-ipa.jpg               # PASS — beer (ABV optional at federal level)
├─ altered-warning.jpg        # FAIL — title-case warning header
├─ regular-warning.jpg        # FAIL — caps but non-bold warning header
├─ wrong-abv.jpg              # FAIL — label says 50%, application says 45%
└─ riverstone-ai.jpg          # FAIL — AI-generated label, real-world OCR test
```

### Request flow for one label

1. Browser packages the image + a JSON-encoded `LabelApplication` (including `beverageClass`) into a `FormData` and POSTs `/api/verify`.
2. The route validates content-type, size (≤ 8 MB), and the application JSON.
3. `extract.ts` base64-encodes the image, calls OpenRouter with a `report_label_fields` tool and `tool_choice` pinned to it — so the model can only respond by filling the schema.
4. The extracted fields are normalised (producer name + address joined, empty strings → `null`, beverage class enum validated).
5. `compare.ts` applies beverage-type-aware rules and runs deterministic, auditable checks per field, producing a `FieldResult[]`.
6. Overall status is `fail` if any field fails or is missing, `review` if anything is `warning`, else `pass`. `n/a` results never block a pass.
7. The response is `{ extracted, results, overall, latencyMs }`.

---

## How verification works

Vision models are good at reading text. They are **not** the right place to make a regulatory decision — that needs to be deterministic, auditable, and unit-testable. So the model only does OCR-with-structure, and a pure-TypeScript comparator decides pass / review / fail.

### Per-field comparison

| Field | Strategy | Pass | Review | Fail / Other |
| --- | --- | --- | --- | --- |
| Beverage type | Enum match between application and model classification | exact match | model says "unknown" | mismatched class (e.g. wine label, spirits application) |
| Brand name | Normalised Levenshtein similarity | similarity = 1.0 | 0.85–0.99 | < 0.85 |
| Class / Type | Normalised Levenshtein similarity | similarity = 1.0 | 0.80–0.99 | < 0.80 |
| Alcohol Content | Parse `%` or `proof` (proof ÷ 2 = ABV), compare numerically; **type-aware exemption** | diff < 0.05% | 0.05 – 0.3% | > 0.3%, or missing when required |
| Net Contents | Parse `mL / L / cL / fl oz / oz`, normalise to mL | diff < 0.5 mL | within 2% of expected | otherwise |
| Producer / Bottler | Normalised Levenshtein on name+address | sim = 1.0 | 0.80–0.99 | < 0.80 |
| Country of Origin (optional) | Normalised Levenshtein similarity | sim = 1.0 | 0.85–0.99 | < 0.85 |
| **Government Warning** | **Strict, case-sensitive header check + bold check + exact-string body match** | exact canonical match, all-caps, bold | ≥ 98% body similar, all-caps, bold (OCR artefact) | header not in caps, OR header not bold, OR text deviates, OR missing |

Normalisation for fuzzy fields: lower-case, collapse whitespace, strip non-alphanumeric (except `% . / -`), unify curly quotes. This is what makes `STONE'S THROW` ≡ `Stone's Throw`.

### Beverage-type-aware ABV rules

The spec calls out *"alcohol content — with some exceptions for certain wine/beer"*. We model the exceptions:

| Beverage type | Missing ABV on the label is treated as |
| --- | --- |
| Spirits | **Missing** (regulatory fail) |
| Wine, expected ≥ 14% | **Missing** (regulatory fail) |
| Wine, expected < 14% | **N/A** ("Wine under 14% — ABV not required if class designation suffices") |
| Beer / malt | **N/A** at federal level (states vary; surfaced as a non-blocking note) |

`N/A` results show as grey "Not required" pills in the UI and never block a `pass`.

### The Government Warning

Hardcoded canonical text from 27 CFR 16.21:

> GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.

Three independent checks:
1. The model returns the warning text verbatim and confirms `warning_header_in_all_caps=true`. The comparator additionally runs its own case-sensitive `startsWith("GOVERNMENT WARNING:")` on the returned text — both must agree, defending against models that silently auto-normalise case in their OCR output. **Failure here is a hard FAIL** (case is visually obvious; the model rarely gets it wrong).
2. The model confirms `warning_header_is_bold=true` (bolder strokes than the surrounding body text, per TTB). **Failure here is REVIEW, not FAIL** — see rationale below.
3. The body text matches the canonical wording (exact, or ≥ 98% similar to flag OCR-level differences as *Review* rather than *Fail*).

The UI renders two badges next to the warning field — `ALL CAPS` and `Bold weight` — green when the signal is true, red when false. This makes the rule visible at a glance for non-technical reviewers.

#### Government Warning — the bold-rule rationale

Jenny's quote was *"all caps and bold"* — both are TTB requirements. Building this against real-photo fixtures from [fsyeddev/ttb-label](https://github.com/fsyeddev/ttb-label), we found the bold signal is the noisiest model output by a wide margin: on legitimate bottle photographs where the warning text is small and slightly compressed, vision models routinely report `warning_header_is_bold=false` even when the header *is* rendered in bold. The caps signal, by contrast, is essentially perfect.

A strict bold FAIL would generate the exact kind of false rejection cycle Sarah described from the previous vendor pilot. We chose to soften it: a `bold=false` reading is surfaced as **Review** with the message *"please confirm visually before rejecting"*. The badge still goes red, the agent still sees the call-out, but the system doesn't auto-reject a legitimate label over a model artefact. This trade-off is unit-tested and documented in both `compare.ts` and `compare.test.ts`.

### TTB Standards of Fill (27 CFR 5.203 / 4.72)

Beyond cross-validating label vs. application, the verifier checks the application's net contents against TTB's allowed bottle sizes per beverage class:

| Beverage class | Approved fills (mL) |
| --- | --- |
| Distilled spirits | 50, 100, 187, 200, 355, 375, 500, 700, 720, 750, 900, 1000, 1750 |
| Wine | 50, 100, 187, 200, 250, 355, 375, 500, 750, 1000, 1500, 3000, 4000 |
| Beer / malt | not federally regulated — row omitted |

A 750 mL bourbon passes; an 800 mL bourbon fails with a plain-language reason. This is what catches the `03-noncompliant-01` community fixture — a label that would otherwise pass every cross-validation check.

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
  beverageClass: "spirits" | "wine" | "beer" | "unknown"
}
```

**Response (200):** `VerifyResponse`

```ts
{
  extracted: {
    brandName, classType, alcoholContent, netContents,
    producer, originCountry, governmentWarning,
    warningStartsWithCapsHeader, warningHeaderIsBold,
    beverageClass, notes
  },
  results: FieldResult[],         // per-field comparison with status + note
  overall: "pass" | "fail" | "review",
  latencyMs: number               // server-measured end-to-end latency
}
```

**Errors:** all responses include a plain-language `error` string.

| Code | Meaning |
| --- | --- |
| `400` | Missing image, missing or invalid application JSON, malformed form |
| `413` | Image > 8 MB |
| `415` | Unsupported image MIME type |
| `500` | Server misconfigured (missing `OPENROUTER_API_KEY`) |
| `502` | OpenRouter call failed or returned unparseable output |

**Example:**

```bash
curl -s -X POST https://treasury-app-eosin.vercel.app/api/verify \
  -F 'application={"brandName":"OLD TOM DISTILLERY","classType":"Kentucky Straight Bourbon Whiskey","alcoholContent":"45% Alc./Vol.","netContents":"750 mL","producer":"Old Tom Distillery, Bardstown, KY","beverageClass":"spirits"}' \
  -F "image=@samples/old-tom.jpg"
```

---

## Model selection & measured latency

Measured end-to-end (curl → `/api/verify` → OpenRouter → response) against the `old-tom.jpg` sample, three runs averaged, from a residential macOS box. Numbers move around in the network; treat them as orders of magnitude.

| Model | Avg latency | Notes |
| --- | --- | --- |
| `google/gemini-2.5-flash` *(default)* | **~2.4 s** | Comfortably inside Sarah's 5 s budget; reliable tool-use. Recommended. |
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
| **OpenRouter abstraction** | Single API key for many models — lets a future procurement swap providers without code changes. Reduces vendor lock-in. |
| **`google/gemini-2.5-flash` as the default** | Sarah: *"If we can't get results back in about 5 seconds, nobody's going to use it."* Gemini Flash measures ~2.4 s end-to-end with margin. Stronger models are one env var away. |
| **Tool/function calling for structured output** | The model can only respond by filling the `report_label_fields` schema — no JSON-in-markdown parsing, no prose to strip, no schema drift between requests. |
| **Deterministic comparator (TypeScript), not "ask the model to decide"** | Regulatory decisions need to be auditable and reproducible. The same expected/found pair will always produce the same status. The model is restricted to reading text; the law is enforced by code with unit tests. |
| **Per-beverage-type rules** | The spec explicitly says *"requirements vary by beverage type"*. ABV missing on a 12% wine is fine (class designation does the job); ABV missing on whiskey is a hard fail. |
| **Fuzzy match for names, strict for the Government Warning** | Dave's STONE'S THROW vs Stone's Throw example: that should be **Pass**, not Fail. Jenny's `GOVERNMENT WARNING:` vs `Government Warning:` example: that **must** be Fail. Both behaviours are covered explicitly and unit-tested. |
| **Triple-check on the warning (text + caps + bold)** | Jenny: *"It has to be exact. Like, word-for-word, and the 'GOVERNMENT WARNING:' part has to be in all caps and bold."* Encoded as three separate signals; all three must agree. |
| **Numeric tolerance for ABV (0.05% / 0.3%) and volume (0.5 mL / 2%)** | Bottling and OCR introduce rounding. A label that reads `45.0%` vs an application that says `45%` should clearly pass; a label that reads `12%` against an application of `12.5%` is a review case worth eyeballing. |
| **Batch via CSV + image files, paired by filename** | Janet's request from the Seattle office. Concurrency capped at 4 for safety with rate limits; the UI streams updates per row, supports filtering and retry, and exports results to CSV so an agent can drop verdicts back into COLA. |
| **`n/a` status (grey "Not required" pill)** | Surfaces *why* a check was skipped, without polluting pass/fail counts. Built specifically for the wine-ABV exemption. |
| **Plain-language error messages** | "Image is too large. Please keep it under 8 MB." instead of "413 Payload Too Large." Sarah's mom test. |
| **Drag-and-drop with hover state, progress text, live batch counter** | Sarah: *"My mother could figure it out"* (73-year-old who learned to video call last year). Big buttons, no hidden state, every field labelled, every async action narrated. |
| **Reviewer notes from the model surfaced as a yellow callout** | Jenny's wish: handle bad photos. When the model is uncertain (angled, glare, occlusion) it can write a free-text note. The UI surfaces it with a *"Consider requesting a clearer photograph"* nudge. |
| **No persistence at all** | Marcus: *"Just don't do anything crazy. We're not storing anything sensitive for this exercise."* Images and form data live for the duration of the request, then go away. No PII in logs. |
| **`compare.ts` is pure and unit-tested** | Auditability. 34 vitest tests cover every comparison rule including the case fail, bold fail, beverage-type exemptions, and Dave's case-insensitivity edge cases. |

---

## Testing

The project ships with three layers of automated tests. Reviewers can run them all from the command line with no setup beyond `npm install`.

### 1. Unit tests — `npm test`

Pure-function tests on the comparator, the OpenRouter extractor (with `fetch` mocked), and the CSV parser. **79 tests**, sub-250ms.

```
$ npm test
> vitest run

 Test Files  3 passed (3)
      Tests  79 passed (79)
   Duration  ~215ms
```

Coverage by file:

| File | Tests | What it pins |
| --- | --- | --- |
| `src/lib/compare.test.ts` | 61 | every comparison rule: similarity boundaries, ABV/volume tolerance, beverage-type ABV exemptions (14% wine boundary, beer N/A), STONE'S THROW judgment, Government Warning (caps strict + bold review + canonical text + near-miss handling), TTB Standards of Fill per beverage class, class/type fuzzy edges, country-of-origin permutations, overallStatus aggregation |
| `src/lib/csv.test.ts` | 11 | CSV parser edge cases: quoted-fields-with-commas, escaped quotes, CRLF, embedded newlines, whitespace-trimmed headers, empty intermediate cells |
| `src/lib/extract.test.ts` | 7 | OpenRouter integration (with `fetch` mocked): producer name+address normalisation, empty-string→null coercion, unknown beverage-class fallback, missing-key error, 4xx/5xx error surfacing, malformed JSON, no-tool-call response |

### 2. End-to-end tests — `npm run test:e2e`

Playwright drives a real headless Chromium against the **live Vercel deployment** — exactly the way a reviewer would test it. The scripts fill the form, upload sample images (including a community photograph), click *Verify*, and assert on the rendered DOM. **5 tests, ~25 s**.

```
$ npm run test:e2e
> playwright test

Running 5 tests using 1 worker

  ✓  1 single label — happy path (OLD TOM DISTILLERY passes)
  ✓  2 single label — strict Government Warning fail (title case)
  ✓  3 single label — wine-under-14% ABV exemption
  ✓  4 community fixture — TTB Standards of Fill non-compliance (800 mL Vodka)
  ✓  5 batch mode — CSV + image folder

  5 passed (25.0s)
```

To run against your local server instead of the live deployment:

```bash
npm run dev               # in one terminal
npm run test:e2e:local    # in another
```

### 3. Run everything — `npm run test:all`

Runs the unit suite then the e2e suite in one command. ~20s end to end.

### What's tested vs. what's mocked

| Layer | What it exercises | What's mocked |
| --- | --- | --- |
| Unit | Comparator, CSV parser, extractor structure | OpenRouter is mocked with deterministic tool-call responses |
| E2E | UI → Next.js API route → real OpenRouter → real model → UI | Nothing — hits the live URL, real model, real network |

Together they cover the compliance logic deterministically *and* prove the deployment actually works for a real agent.

---

## Limitations and known issues

- **Vision OCR accuracy is the floor of the system.** The comparator is deterministic, but if the model misreads a number, the verdict is wrong. The `notes` field is the safety valve.
- **Bold detection is the noisiest signal.** Models can be inconsistent about typography weight at small font sizes — fine on real labels with sharp contrast, less reliable on heavily-compressed photos. We mitigate by also requiring `warning_header_in_all_caps`; weight alone never blocks a pass.
- **OpenRouter must be reachable.** Marcus warned about TTB's outbound firewalls; production would need an allowlist for `openrouter.ai` (or swap to a direct provider that's already approved, e.g. Bedrock in GovCloud).
- **Canonical warning text is hardcoded.** It's the current 27 CFR 16.21 wording. A real deployment would version this and pull from a managed source.
- **Batch concurrency is capped at 4** to stay friendly to typical OpenRouter rate limits. Production should queue, retry, and back off on 429s.
- **CSV pairing is by filename, case-sensitive.** Simple and predictable, but not forgiving — `Foo.jpg` and `foo.jpg` won't match. Production would pull straight from COLA application records.
- **No authentication.** Per Marcus's "standalone proof-of-concept" framing. Production would sit behind agent SSO.
- **No persisted audit log.** Every verification is ephemeral. A real deployment would append-only-log every verdict for downstream COLA reconciliation.
