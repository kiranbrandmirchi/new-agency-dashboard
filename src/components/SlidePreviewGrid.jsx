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
  slide5Loading = false,
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
        <p>
          Slide 2: editable (session) · slide 5 KPIs: current calendar month · table: selected vs prior month
          {slide5Loading ? ' · loading slide 5…' : ''}
          {' · '}slides 1, 4–6: client &amp; month · 7–10: sample
        </p>
      </div>
      {grid}
    </section>
  );
}
