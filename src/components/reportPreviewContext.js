import { createContext, useContext } from 'react';
import { reportData } from '../data/reportData';

/** @typedef {import('../data/reportData').ReportData} ReportData */

/**
 * @typedef {Object} ReportPreviewContextValue
 * @property {ReportData} report
 * @property {boolean} slide2Editable
 * @property {(index: number, field: 'title' | 'body', value: string) => void} [updateSlide2Service]
 * @property {boolean} slide3Editable
 * @property {(field: keyof ReportData['leadSummary']['tableRow'], value: string) => void} [updateSlide3TableRow]
 * @property {(index: number, value: string) => void} [updateSlide3StatBox]
 * @property {boolean} slideBottomInsightEditable
 * @property {(slideNum: import('../data/reportData').SlideBottomInsightNum, value: string) => void} [updateSlideBottomInsight]
 */

/** @type {import('react').Context<ReportPreviewContextValue>} */
export const ReportPreviewContext = createContext({
  report: reportData,
  slide2Editable: false,
  updateSlide2Service: undefined,
  slide3Editable: false,
  updateSlide3TableRow: undefined,
  updateSlide3StatBox: undefined,
  slideBottomInsightEditable: false,
  updateSlideBottomInsight: undefined,
});

export function useReportPreview() {
  return useContext(ReportPreviewContext);
}

export function useReport() {
  return useContext(ReportPreviewContext).report;
}
