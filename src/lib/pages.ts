"use client";

import type { PageImage } from "./types";

// 1000px is enough for typed/printed text and keeps each page image small
// (≈80–200KB base64), well under Vercel's 4.5MB body limit.
// For handwritten sheets with fine detail, raise this to 1200.
const MAX_SIDE = 1000;
const QUALITY = 0.80;

async function fileToPages(file: File): Promise<PageImage[]> {
  if (file.type === "application/pdf") return pdfToPages(file);
  return [await imageFileToPage(file, 0)];
}

async function imageFileToPage(file: File, index: number): Promise<PageImage> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const { dataUrl, width, height } = renderToCanvas(img, img.naturalWidth, img.naturalHeight);
      resolve({ index, dataUrl, width, height });
    };
    img.onerror = reject;
    img.src = url;
  });
}

function renderToCanvas(
  source: HTMLImageElement | HTMLCanvasElement,
  srcW: number,
  srcH: number,
): { dataUrl: string; width: number; height: number } {
  const scale = Math.min(1, MAX_SIDE / Math.max(srcW, srcH));
  const w = Math.round(srcW * scale);
  const h = Math.round(srcH * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(source, 0, 0, w, h);
  return { dataUrl: canvas.toDataURL("image/jpeg", QUALITY), width: w, height: h };
}

async function pdfToPages(file: File): Promise<PageImage[]> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.mjs",
    import.meta.url,
  ).toString();

  const buffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buffer }).promise;
  const pages: PageImage[] = [];

  // Render all pages — use Promise.all for speed since this is CPU-bound in browser
  const pagePromises = Array.from({ length: pdf.numPages }, async (_, i) => {
    const page = await pdf.getPage(i + 1);
    const vp = page.getViewport({ scale: 1 });
    const scale = Math.min(1, MAX_SIDE / Math.max(vp.width, vp.height));
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvasContext: ctx, viewport }).promise;
    const { dataUrl, width, height } = renderToCanvas(canvas, canvas.width, canvas.height);
    return { index: i, dataUrl, width, height };
  });

  const results = await Promise.all(pagePromises);
  pages.push(...results.sort((a, b) => a.index - b.index));
  return pages;
}

export async function filesToPages(files: File[]): Promise<PageImage[]> {
  const groups = await Promise.all(files.map(fileToPages));
  const pages = groups.flat();
  pages.forEach((p, i) => (p.index = i));
  return pages;
}
