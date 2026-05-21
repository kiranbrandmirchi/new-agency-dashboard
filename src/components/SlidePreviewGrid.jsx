import React from 'react';
import { SLIDE_DEFINITIONS } from '../data/reportData';
import { SlidePreview } from './SlidePreview';
import '../styles/pptSlidePreview.css';

export function SlidePreviewGrid({
  clientName,
  monthLabel,
  report,
  slidesOnly = false,
  exportMode = false,
}) {
  const grid = (
    <div className="ppt-preview-grid">
      {SLIDE_DEFINITIONS.map((slide, index) => (
        <SlidePreview
          key={slide.num}
          slide={slide}
          index={index}
          exportMode={exportMode}
          report={report}
        />
      ))}
    </div>
  );

  if (slidesOnly) {
    return grid;
  }

  return (
    <section className="ppt-preview-section">
      <div className="ppt-preview-header">
        <h3>
          {clientName} — {monthLabel} Report Preview
        </h3>
        <p>Slides 1–6: client &amp; month from selections · slides 7–10: sample data</p>
      </div>
      {grid}
    </section>
  );
}
