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
  slide3Editable = false,
  updateSlide3TableRow,
  updateSlide3StatBox,
  slideBottomInsightEditable = false,
  updateSlideBottomInsight,
  reportSlidesLoading = false,
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
          slide3Editable={slide3Editable}
          updateSlide3TableRow={updateSlide3TableRow}
          updateSlide3StatBox={updateSlide3StatBox}
          slideBottomInsightEditable={slideBottomInsightEditable}
          updateSlideBottomInsight={updateSlideBottomInsight}
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
          Slide 2, 3 &amp; bottom notes: editable (session) · slides 5–6: live Supabase data · 7–10: sample
          {reportSlidesLoading ? ' · loading slides 5–6…' : ''}
        </p>
      </div>
      {grid}
    </section>
  );
}
