# Marking Desk

Upload a question paper and one student's handwritten answer booklet. Click any question and the exact patch of handwriting that answers it lights up on the sheet — wherever the student put it, across however many pages it runs.

Built for the VedaAI full-stack assignment: **AI Assessment Extraction & Answer Mapping**.

---

## Run it locally

```bash
npm install
cp .env.example .env.local     # add your Gemini key
npm run dev                    # http://localhost:3000
```

Get a free Gemini key at <https://aistudio.google.com/apikey>.

If no server key is set, the app asks the visitor for their own key and keeps it in the browser tab only. That means the deployed demo keeps working even if the project key runs out of free-tier quota.

## Deploy

Vercel, zero config:

```bash
npm i -g vercel
vercel            # first deploy
vercel --prod     # production URL
```

Add `GEMINI_API_KEY` (and optionally `GEMINI_MODEL`) in **Project → Settings → Environment Variables**, then redeploy. Netlify, Render and Railway all work the same way — it is a stock Next.js app with no database and no auth.

---

## How it works

```
uploads ──▶ rasterise ──▶ question extraction ──▶ answer extraction ──▶ mapping ──▶ marking
 (browser)   (browser)      (per page, API)         (per page, API)      (API)       (API)
```

**1. Rasterise, in the browser.** PDFs are rendered page by page to JPEG with `pdf.js` on the client; images are downscaled to a sane resolution. Doing this client-side means the server never handles a 40 MB PDF, every request stays well under the serverless body limit, and one request maps to exactly one page — which is also what gives the progress bar something honest to report.

**2. Question extraction** (`/api/extract-questions`). One call per page of the paper. The model returns each question in printed order with its number copied verbatim, its marks, its section, and a bounding box. Labelled sub-parts are forced apart: `11 (a)` and `11 (b)` come back as two entries, with the shared stem prefixed to each so both can stand alone. Headers, instructions and "answer any five" banners are dropped.

**3. Answer extraction** (`/api/extract-answers`). One call per page of the booklet. The model splits the page into answer blocks and returns, for each: the number the student actually wrote (or `null` — it is told never to guess one from content), a transcription, a `continuation` flag, a confidence, and a bounding box as `[ymin, xmin, ymax, xmax]` normalised to 0–1000. Blocks are re-sorted by vertical position afterwards, because reading order is more trustworthy than emission order.

**4. Mapping** (`/api/map`) runs in two passes:

- *Deterministic.* Every written label is normalised — `Q.11 (a)`, `11a.`, `Ans 11 A)` all collapse to `11a` — and matched against the question index. This is what makes out-of-order answering a non-issue: a label matches its question no matter where on the sheet it appears.
- *Semantic.* Only the blocks no label could place are sent, as text, alongside only the questions still unanswered. The model is told plainly that returning `null` is better than a plausible guess, one answer may not take two questions, and anything under 0.55 confidence is discarded. Those matches are badged **matched by content** in the UI so the teacher knows the difference.

**5. Marking** (`/api/grade`). Optional, one call. Per-question verdict, marks out of the printed total, and feedback capped at 30 words, plus an overall summary. Marks are clamped server-side to the question's own maximum so a model slip cannot invent marks that do not exist.

Everything lives in React state. No database, nothing written to disk, nothing retained after the tab closes.

### The interface

Two panes. Questions on the left in printed order, each showing where its answer landed or that it is blank. The booklet on the right, at full width, with a **marking spine** down the margin: every detected answer's question number sits at the exact height of that answer, like a teacher's thumb-index. Select a question and the rest of the page dims, the answer's region is bracketed in marking red, and the view scrolls to it. Regions on the sheet are clickable in reverse — click handwriting, and the question it answers is selected.

Arrow keys step through the paper. **Export marks** downloads the whole result as CSV.

---

## Edge cases, and what happens

| Case | Behaviour |
|---|---|
| Sub-parts `11 (a)`, `11 (b)` | Separate entries, shared stem attached to each |
| Numbering styles `Q.3`, `3.`, `3 (i)`, `Ans 3` | Normalised to one key before matching |
| Answers written out of order | Irrelevant — matching is by label, not position |
| Answer spans two or more pages | Unlabelled continuation blocks attach to the block immediately before them in reading order, across the page break. Highlighting then shows every region, on every page, with a "1 of 3" counter |
| A stray answer interrupts a runover | The chain breaks rather than swallowing later writing, and the stray goes to the semantic pass |
| Question left unanswered | Stays in the list, flagged **no answer**, counted in the tally, marked `unanswered` |
| Answer matching no question | Listed under **Written, but not against any question**, clickable, highlighted on the sheet, dashed in the spine |
| Two-column pages | Extraction is instructed to finish the left column first |
| Illegible handwriting | Transcribed as `[illegible]`; feedback says so instead of assuming the worst |
| Rate limit or a retired model id | Exponential backoff, then a walk down the free-tier Flash models |
| Model wraps JSON in prose or fences | Tolerant parser recovers the JSON instead of failing the run |
| Marking pass fails | Mapping still stands and renders — feedback is the garnish, mapping is the product |

## Assumptions and limits

- One student's booklet per run, as specified.
- The question paper is printed; the answer sheet is handwritten. A handwritten question paper will extract far less reliably.
- Bounding boxes come from the model. They are tight and consistent in testing but they are estimates, not OCR-exact geometry — which is why regions are drawn with a little padding and why nearby strips merge into one band.
- Free-tier Gemini is roughly 10–15 requests per minute. Pages are processed sequentially with a short gap. A 20-page booklet takes a couple of minutes; a paid key removes that ceiling.
- Semantic matching is deliberately conservative. It would rather leave an answer unplaced and visible than place it wrongly, because a teacher trusts what the screen says.
- No auth, no database, no persistence — per the brief.

## Layout

```
src/app/page.tsx                    state, selection, CSV export
src/app/layout.tsx, globals.css     shell and design tokens
src/app/api/extract-questions       one page of the paper  → questions
src/app/api/extract-answers         one page of the sheet  → answer blocks + boxes
src/app/api/map                     deterministic + semantic mapping
src/app/api/grade                   marks, feedback, summary
src/app/api/status                  does the server hold a key
src/lib/pages.ts                    PDF and image rasterising
src/lib/pipeline.ts                 orchestration and progress
src/lib/mapping.ts                  label normalising, boxes, merging, matching
src/lib/gemini.ts                   REST client, retries, model fallback, JSON recovery
src/components/                     Uploader, QuestionPane, SheetPane
```
