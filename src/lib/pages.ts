"use client";

import type { PageImage } from "./types";

// Max dimension so images are readable but requests stay under Vercel's 4.5 MB body limit.
const MAX_SIDE = 1500;
const QUALITY = 0.78;

async function fileToPages(file: File): Promise<PageImage[]> {
  if (file.type === "application/pdf") {
    return pdfToPages(file);
  }
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
  ctx.drawImage(source, 0, 0, w, h);
  return { dataUrl: canvas.toDataURL("image/jpeg", QUALITY), width: w, height: h };
}

async function pdfToPages(file: File): Promise<PageImage[]> {
  // Dynamic import so pdfjs-dist is not included in the server bundle.
  const pdfjs = await import("pdfjs-dist");
  // Use the bundled worker from node_modules.
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.mjs",
    import.meta.url,
  ).toString();

  const buffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buffer }).promise;
  const pages: PageImage[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const vp = page.getViewport({ scale: 1 });
    const scale = Math.min(1, MAX_SIDE / Math.max(vp.width, vp.height));
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext("2d")!;

    await page.render({ canvasContext: ctx, viewport }).promise;
    const { dataUrl, width, height } = renderToCanvas(canvas, canvas.width, canvas.height);
    pages.push({ index: i - 1, dataUrl, width, height });
  }

  return pages;
}

export async function filesToPages(files: File[]): Promise<PageImage[]> {
  const groups = await Promise.all(files.map(fileToPages));
  const pages = groups.flat();
  // Re-index so page numbers are contiguous across multiple files.
  pages.forEach((p, i) => (p.index = i));
  return pages;
}
