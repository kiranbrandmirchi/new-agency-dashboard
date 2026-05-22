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
  slide2Editable = false,
  updateSlide2Service,
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
          slide2Editable={slide2Editable}
          updateSlide2Service={updateSlide2Service}
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
        <p>Slide 2: click text to edit (session only) · slides 1, 4–6: client &amp; month · slide 5: month vs prior month · 7–10: sample</p>
      </div>
      {grid}
    </section>
  );
}
