import { createContext, useContext } from 'react';
import { reportData } from '../data/reportData';

/** @typedef {import('../data/reportData').ReportData} ReportData */

/**
 * @typedef {Object} ReportPreviewContextValue
 * @property {ReportData} report
 * @property {boolean} slide2Editable
 * @property {(index: number, field: 'title' | 'body', value: string) => void} [updateSlide2Service]
 */

/** @type {import('react').Context<ReportPreviewContextValue>} */
export const ReportPreviewContext = createContext({
  report: reportData,
  slide2Editable: false,
  updateSlide2Service: undefined,
});

export function useReportPreview() {
  return useContext(ReportPreviewContext);
}

export function useReport() {
  return useContext(ReportPreviewContext).report;
}
