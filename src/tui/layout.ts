import { getSize } from './renderer.ts';

export const HEADER_ROWS = 1;
export const STATUS_ROWS = 1;

export interface LayoutInfo {
  rows: number;
  cols: number;
  headerStart: number;
  headerEnd: number;
  contentStart: number;
  contentEnd: number;
  contentHeight: number;
  statusStart: number;
  statusEnd: number;
}

export function getLayout(): LayoutInfo {
  const { rows, cols } = getSize();
  const contentHeight = rows - HEADER_ROWS - STATUS_ROWS;

  const headerStart = 1;
  const headerEnd = headerStart + HEADER_ROWS - 1;
  const contentStart = headerEnd + 1;
  const contentEnd = contentStart + contentHeight - 1;
  const statusStart = contentEnd + 1;
  const statusEnd = rows;

  return {
    rows,
    cols,
    headerStart,
    headerEnd,
    contentStart,
    contentEnd,
    contentHeight,
    statusStart,
    statusEnd,
  };
}
