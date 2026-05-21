import React from 'react';
import { SLIDE_DEFINITIONS } from '../data/reportData';
import { SlidePreview } from './SlidePreview';
import '../styles/pptSlidePreview.css';

export function SlidePreviewGrid({ clientName, monthLabel, slidesOnly = false, exportMode = false }) {
  const grid = (
    <div className="ppt-preview-grid">
      {SLIDE_DEFINITIONS.map((slide, index) => (
        <SlidePreview key={slide.num} slide={slide} index={index} exportMode={exportMode} />
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
        <p>Slides 1–10 · Hardcoded data — dynamic integration pending</p>
      </div>
      {grid}
    </section>
  );
}
