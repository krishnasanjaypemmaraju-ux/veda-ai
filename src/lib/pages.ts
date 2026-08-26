"use client";

import type { PageImage } from "./types";

const TARGET_WIDTH = 1500; // enough for handwriting, small enough for one request per page
const MAX_SIDE = 2000;
const QUALITY = 0.78;

let pdfjs: typeof import("pdfjs-dist") | null = null;

async function getPdfjs() {
  if (pdfjs) return pdfjs;
  const lib = await import("pdfjs-dist");
  lib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();
  pdfjs = lib;
  return lib;
}

function canvasToPage(canvas: HTMLCanvasElement, index: number): PageImage {
  return {
    index,
    dataUrl: canvas.toDataURL("image/jpeg", QUALITY),
    width: canvas.width,
    height: canvas.height,
  };
}

async function imageToPage(file: File, index: number): Promise<PageImage> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvasToPage(canvas, index);
}

async function pdfToPages(
  file: File,
  offset: number,
  onPage?: (done: number, total: number) => void,
): Promise<PageImage[]> {
  const lib = await getPdfjs();
  const buffer = await file.arrayBuffer();
  const doc = await lib.getDocument({ data: buffer }).promise;
  const pages: PageImage[] = [];

  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(TARGET_WIDTH / base.width, MAX_SIDE / base.height);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    pages.push(canvasToPage(canvas, offset + pages.length));
    onPage?.(n, doc.numPages);
  }

  return pages;
}

/** Accepts a mix of PDFs and images and returns one flat, ordered page list. */
export async function filesToPages(
  files: File[],
  onPage?: (done: number, total: number) => void,
): Promise<PageImage[]> {
  const pages: PageImage[] = [];
  for (const file of files) {
    if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
      const produced = await pdfToPages(file, pages.length, onPage);
      pages.push(...produced);
    } else {
      pages.push(await imageToPage(file, pages.length));
      onPage?.(pages.length, pages.length);
    }
  }
  return pages.map((p, i) => ({ ...p, index: i }));
}
