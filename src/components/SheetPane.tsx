"use client";

import { useEffect, useRef } from "react";
import { mergeRegions } from "@/lib/mapping";
import type { AnswerBlock, PageImage, Region } from "@/lib/types";

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

  useEffect(() => {
    if (props.activeBlockIds.length && anchor.current) {
      anchor.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [props.activeBlockIds]);

  const activeRegions: Region[] = mergeRegions(
    props.blocks.filter((b) => activeSet.has(b.id)).map((b) => b.region),
  );
  const activePages = new Set(activeRegions.map((r) => r.page));

  return (
    <div className="vd-sheet-pane">
      <div className="vd-sheet-bar">
        {props.activeLabel ? (
          <>
            <span>
              Showing <strong>{props.activeLabel}</strong>
            </span>
            <span>
              {activeRegions.length} region{activeRegions.length === 1 ? "" : "s"} across{" "}
              {activePages.size} page{activePages.size === 1 ? "" : "s"}
            </span>
            <button className="vd-clear" onClick={props.onClear}>
              Show whole booklet
            </button>
          </>
        ) : (
          <span>Pick a question on the left to light up its answer.</span>
        )}
      </div>

      <div className="vd-pages">
        {props.pages.map((page) => {
          const pageBlocks = props.blocks.filter((b) => b.page === page.index && b.text);
          const pageActive = activeRegions.filter((r) => r.page === page.index);
          const idle = pageBlocks.filter((b) => !activeSet.has(b.id));

          return (
            <div className="vd-page" key={page.index}>
              <div className="vd-spine">
                {pageBlocks.map((b) => {
                  const on = activeSet.has(b.id);
                  return (
                    <span
                      key={b.id}
                      className={`vd-spine-mark${on ? " is-active" : ""}${
                        b.label ? "" : " is-orphan"
                      }`}
                      style={{ top: `${b.region.rect.y}%`, height: `${b.region.rect.h}%` }}
                      title={b.label ? `Answer to ${b.label}` : "Unlabelled answer"}
                    >
                      {b.label ?? "?"}
                    </span>
                  );
                })}
              </div>

              <div className="vd-canvas">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={page.dataUrl} alt={`Answer booklet page ${page.index + 1}`} />

                {idle.map((b) => (
                  <button
                    key={b.id}
                    className="vd-region is-idle"
                    style={{
                      left: `${b.region.rect.x}%`,
                      top: `${b.region.rect.y}%`,
                      width: `${b.region.rect.w}%`,
                      height: `${b.region.rect.h}%`,
                    }}
                    onClick={() => props.onSelectBlock(b.id)}
                    aria-label={`Answer block on page ${page.index + 1}`}
                  />
                ))}

                {props.activeBlockIds.length > 0 && <div className="vd-veil" />}

                {pageActive.map((r, i) => (
                  <div
                    key={`${page.index}-${i}`}
                    className="vd-region is-active"
                    ref={i === 0 && page.index === activeRegions[0]?.page ? anchor : undefined}
                    style={{
                      left: `${r.rect.x}%`,
                      top: `${r.rect.y}%`,
                      width: `${r.rect.w}%`,
                      height: `${r.rect.h}%`,
                    }}
                  >
                    {props.activeLabel && (
                      <span className="vd-region-tag">
                        {props.activeLabel}
                        {activeRegions.length > 1 ? ` · ${i + 1} of ${activeRegions.length}` : ""}
                      </span>
                    )}
                  </div>
                ))}

                <span className="vd-page-no">page {page.index + 1}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
