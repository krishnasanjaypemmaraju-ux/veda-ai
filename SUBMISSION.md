# Submission answers — paste these into the form

Fill in the two links first, then copy each block as-is.

**Live URL:** `https://__________.vercel.app`
**GitHub repository:** `https://github.com/__________/veda-marking-desk`

---

## Brief explanation of your approach

The flow is question extraction → answer extraction → mapping → marking, with each stage isolated behind its own endpoint so a failure late in the chain does not lose the work already done.

PDFs are rasterised to page images in the browser with pdf.js, not on the server. That keeps every API request to a single page, stays under the serverless body limit regardless of file size, and gives the progress indicator something real to report.

Questions are extracted one page at a time, in printed order, with numbering copied verbatim. Labelled sub-parts are forced apart into separate entries with the shared stem attached to each, so 11 (a) and 11 (b) are two questions that can each stand alone.

Answers are extracted one page at a time as blocks. Each block carries the number the student actually wrote — or null, since the model is explicitly told never to infer a number from content — plus a transcription, a continuation flag, a confidence, and a bounding box normalised to 0–1000. Blocks are re-sorted by vertical position, because reading order is more reliable than the order the model happened to emit them in.

Mapping runs deterministically first. Every label is normalised, so Q.11 (a), 11a. and Ans 11 A) all collapse to the same key, which makes out-of-order answering a non-issue. Unlabelled continuation blocks attach to the block immediately before them in reading order, which is what carries an answer across a page break; if a stray interrupts, the chain breaks rather than swallowing later writing. Only what is left over goes to a second, semantic pass, which sees just the unplaced answers and just the still-unanswered questions, is told that returning null beats a plausible guess, and has anything under 0.55 confidence discarded. Those matches are badged separately in the UI so a teacher knows which are inferred.

Marking is one final pass: per-question verdict, marks clamped server-side to the question's own maximum, feedback capped at thirty words, and an overall summary. If it fails, mapping still renders — mapping is the product, feedback is the garnish.

The interface is two panes. Questions on the left in printed order, each showing where its answer landed or that it is blank. The booklet on the right with a marking spine down the margin, where every detected answer's number sits at the exact height of that answer, like a teacher's thumb-index. Selecting a question dims the page, brackets the answer region in marking red and scrolls to it; multi-page answers are counted "1 of 3". It works in reverse too — click the handwriting and its question is selected. Arrow keys step through the paper, and the whole result exports as CSV.

Next.js App Router, TypeScript, no database, no auth, in-memory state only.

## AI model / API used

Google Gemini (free tier), called over the REST generateContent endpoint. Default model gemini-3.6-flash, configurable with GEMINI_MODEL; the client automatically falls back down the free-tier Flash models if an id has been retired on the account. Gemini was chosen because one model reads printed text, reads handwriting, and returns bounding boxes in the same call — the boxes are what make exact region highlighting possible without a separate OCR or layout-detection stage. Requests use temperature 0 and JSON response mode, with exponential backoff on rate limits and a tolerant parser that recovers JSON if the model wraps it in prose.

## Important assumptions and limitations

One student's booklet per run. The question paper is assumed printed; the answer sheet handwritten.

Bounding boxes are model estimates, not OCR-exact geometry. Regions are drawn with slight padding and vertically adjacent strips merge into one band so an answer reads as a single highlighted region.

Free-tier Gemini allows roughly 10–15 requests per minute, so pages are processed sequentially with a short gap between them; a twenty-page booklet takes a couple of minutes. A paid key removes that ceiling.

Semantic matching is deliberately conservative and will leave an answer unplaced rather than place it wrongly, since a teacher trusts what the screen says. Unplaced answers stay visible in their own section instead of disappearing.

If the deployment has no server key, the app asks the visitor for their own and keeps it in the tab only, so the demo keeps working after free-tier quota runs out.

No authentication, no database, nothing persisted after the tab closes.
