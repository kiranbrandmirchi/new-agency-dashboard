/** 16:9 slide size in inches — matches preview aspect ratio, PPTX LAYOUT_16x9, and PDF pages */
export const SLIDE_W_IN = 10;
export const SLIDE_H_IN = 5.625;

/** Cover slide split — 34% red sidebar | 66% dark content (aligned with preview CSS) */
export const COVER_LEFT_W_IN = 3.4;
export const COVER_RIGHT_X_IN = COVER_LEFT_W_IN;
export const COVER_RIGHT_W_IN = SLIDE_W_IN - COVER_LEFT_W_IN;
