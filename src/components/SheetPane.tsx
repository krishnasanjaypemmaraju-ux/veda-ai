"use client";
import { useEffect, useRef, useState } from "react";
import { mergeRegions } from "@/lib/mapping";
import type { AnswerBlock, PageImage, Region } from "@/lib/types";

function hasRealText(b: AnswerBlock) {
  return b.text.trim().replace(/\u200b/g, "").length > 0;
}

export default function SheetPane(props: {
  pages: PageImage[];
  blocks: AnswerBlock[];
  activeBlockIds: string[];
  activeLabel: string | null;
  onSelectBlock: (id: string) => void;
  onClear: () => void;
}) {
  const activeSet = new Set(props.activeBlockIds);
  const anchor = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState(100);
  const [currentPage, setCurrentPage] = useState(0);

  useEffect(() => {
    if (props.activeBlockIds.length && anchor.current) {
      anchor.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [props.activeBlockIds]);

  // Jump to the page of the first active block
  useEffect(() => {
    if (props.activeBlockIds.length) {
      const first = props.blocks.find(b => activeSet.has(b.id));
      if (first) setCurrentPage(first.page);
    }
  }, [props.activeBlockIds]);

  const activeRegions: Region[] = mergeRegions(
    props.blocks.filter(b => activeSet.has(b.id)).map(b => b.region),
  );

  const totalPages = props.pages.length;

  return (
    <div className="vd-sheet-pane">
      {/* header bar */}
      <div className="vd-sheet-bar">
        <span className="vd-sheet-title">Answer Sheet</span>

        {props.activeLabel && (
          <>
            <span style={{color:"var(--orange)",fontWeight:600}}>Q{props.activeLabel}</span>
            <button className="vd-clear" onClick={props.onClear}>Show all</button>
          </>
        )}

        {/* zoom */}
        <div className="vd-zoom-group">
          <button className="vd-zoom-btn" onClick={() => setZoom(z => Math.max(50, z - 25))}>−</button>
          <span className="vd-zoom-val">{zoom}%</span>
          <button className="vd-zoom-btn" onClick={() => setZoom(z => Math.min(200, z + 25))}>+</button>
        </div>

        {/* page nav */}
        {totalPages > 1 && (
          <div className="vd-page-nav">
            <button className="vd-page-nav-btn" onClick={() => setCurrentPage(p => Math.max(0, p - 1))} disabled={currentPage === 0}>‹</button>
            <span>Page {currentPage + 1} of {totalPages}</span>
            <button className="vd-page-nav-btn" onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))} disabled={currentPage === totalPages - 1}>›</button>
          </div>
        )}
      </div>

      {/* pages */}
      <div className="vd-pages">
        {props.pages.map(page => {
          const pageBlocks = props.blocks.filter(b => b.page === page.index && hasRealText(b));
          const pageActive = activeRegions.filter(r => r.page === page.index);
          const idle = pageBlocks.filter(b => !activeSet.has(b.id));
          const isCurrentPage = page.index === currentPage || totalPages === 1;

          if (!isCurrentPage && totalPages > 1) return null;

          return (
            <div className="vd-page" key={page.index} style={{ width: `${zoom}%`, maxWidth: 820 }}>
              <div className="vd-spine">
                {pageBlocks.map(b => {
                  const on = activeSet.has(b.id);
                  return (
                    <span key={b.id}
                      className={`vd-spine-mark${on ? " is-active" : ""}${b.label ? "" : " is-orphan"}`}
                      style={{ top: `${b.region.rect.y}%`, height: `${b.region.rect.h}%` }}
                      title={b.label ? `Answer ${b.label}` : "Unlabelled"}>
                      {b.label ?? "?"}
                    </span>
                  );
                })}
              </div>

              <div className="vd-canvas">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={page.dataUrl} alt={`Page ${page.index + 1}`} />

                {idle.map(b => (
                  <button key={b.id} className="vd-region is-idle"
                    style={{ left:`${b.region.rect.x}%`, top:`${b.region.rect.y}%`, width:`${b.region.rect.w}%`, height:`${b.region.rect.h}%` }}
                    onClick={() => props.onSelectBlock(b.id)}
                    aria-label={`Answer block page ${page.index + 1}`} />
                ))}

                {props.activeBlockIds.length > 0 && <div className="vd-veil" />}

                {pageActive.map((r, i) => (
                  <div key={`${page.index}-${i}`} className="vd-region is-active"
                    ref={i === 0 && page.index === (activeRegions[0]?.page ?? -1) ? anchor : undefined}
                    style={{ left:`${r.rect.x}%`, top:`${r.rect.y}%`, width:`${r.rect.w}%`, height:`${r.rect.h}%` }}>
                    {props.activeLabel && (
                      <span className="vd-region-tag">
                        Q{props.activeLabel}{activeRegions.length > 1 ? ` · ${i+1}/${activeRegions.length}` : ""}
                      </span>
                    )}
                  </div>
                ))}

                <span className="vd-page-no">page {page.index + 1}</span>
              </div>
            </div>
          );
        })}

        {props.pages.length === 0 && (
          <div className="vd-empty">No answer sheet pages loaded.</div>
        )}
      </div>
    </div>
  );
}
