"use client";
import { useEffect, useRef, useState } from "react";
import { mergeRegions } from "@/lib/mapping";
import type { AnswerBlock, PageImage, Region } from "@/lib/types";

const isReal = (b: AnswerBlock) => b.text.replace(/\u200b/g, "").trim().length > 0;

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
  const [page, setPage] = useState(0);
  const total = props.pages.length;

  useEffect(() => {
    if (props.activeBlockIds.length) {
      const first = props.blocks.find(b => activeSet.has(b.id));
      if (first !== undefined) setPage(first.page);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.activeBlockIds]);

  useEffect(() => {
    if (props.activeBlockIds.length && anchor.current) {
      anchor.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [props.activeBlockIds]);

  const activeRegions: Region[] = mergeRegions(
    props.blocks.filter(b => activeSet.has(b.id)).map(b => b.region),
  );

  const curPage = props.pages[page];

  return (
    <div className="vd-sheet-pane">
      {/* Toolbar */}
      <div className="vd-sheet-bar">
        <span className="vd-sheet-ttl">Answer Sheet</span>

        {props.activeLabel ? (
          <>
            <span className="vd-sheet-active-tag">📍 Q{props.activeLabel}</span>
            <button className="vd-sheet-clear" onClick={props.onClear}>✕ Clear</button>
          </>
        ) : (
          <span style={{fontSize:12,color:"rgba(255,255,255,0.28)"}}>
            Click a question to highlight its answer
          </span>
        )}

        <div className="vd-sheet-controls">
          <div className="vd-ctrl-group">
            <button className="vd-ctrl-btn" onClick={() => setZoom(z => Math.max(50, z - 25))}>−</button>
            <span className="vd-ctrl-val">{zoom}%</span>
            <button className="vd-ctrl-btn" onClick={() => setZoom(z => Math.min(200, z + 25))}>+</button>
          </div>
          {total > 1 && (
            <div className="vd-page-nav">
              <button className="vd-page-nav-btn" disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))}>‹</button>
              <span>Page {page + 1} of {total}</span>
              <button className="vd-page-nav-btn" disabled={page === total - 1} onClick={() => setPage(p => Math.min(total - 1, p + 1))}>›</button>
            </div>
          )}
        </div>
      </div>

      {/* Pages */}
      <div className="vd-pages">
        {curPage ? (
          <div className="vd-page" style={{width:`${zoom}%`, maxWidth: 860}}>
            <div className="vd-spine">
              {props.blocks
                .filter(b => b.page === curPage.index && isReal(b))
                .map(b => (
                  <span key={b.id}
                    className={`vd-spine-mark${activeSet.has(b.id) ? " is-active" : ""}${b.label ? "" : " is-orphan"}`}
                    style={{top:`${b.region.rect.y}%`, height:`${b.region.rect.h}%`}}
                    title={b.label ? `Q${b.label}` : "Unlabelled"}>
                    {b.label ?? "?"}
                  </span>
                ))}
            </div>
            <div className="vd-canvas">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={curPage.dataUrl} alt={`Answer sheet page ${curPage.index + 1}`} />

              {/* Idle click targets */}
              {props.blocks
                .filter(b => b.page === curPage.index && isReal(b) && !activeSet.has(b.id))
                .map(b => (
                  <button key={b.id} className="vd-region is-idle"
                    style={{left:`${b.region.rect.x}%`, top:`${b.region.rect.y}%`, width:`${b.region.rect.w}%`, height:`${b.region.rect.h}%`}}
                    onClick={() => props.onSelectBlock(b.id)}
                    aria-label={`Answer block page ${curPage.index + 1}`} />
                ))}

              {props.activeBlockIds.length > 0 && <div className="vd-veil" />}

              {activeRegions
                .filter(r => r.page === curPage.index)
                .map((r, i) => (
                  <div key={i} className="vd-region is-active"
                    ref={i === 0 ? anchor : undefined}
                    style={{left:`${r.rect.x}%`, top:`${r.rect.y}%`, width:`${r.rect.w}%`, height:`${r.rect.h}%`}}>
                    {props.activeLabel && (
                      <span className="vd-region-tag">
                        Q{props.activeLabel}
                        {activeRegions.filter(x => x.page === curPage.index).length > 1 ? ` · ${i + 1}` : ""}
                      </span>
                    )}
                  </div>
                ))}

              <span className="vd-page-no">p.{curPage.index + 1}</span>
            </div>
          </div>
        ) : (
          <div className="vd-empty">No pages loaded</div>
        )}
      </div>
    </div>
  );
}
