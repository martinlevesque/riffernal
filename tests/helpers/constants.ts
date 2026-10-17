import {
  BTN_ADD_LOOP_ID,
  BTN_CLEAR_LOOPS_CANCEL_ID,
  BTN_CLEAR_LOOPS_ID,
  BTN_CLEAR_LOOPS_OK_ID,
  BTN_CLOSE_SHEET_ID,
  BTN_DEFINE_LOOP_ID,
  BTN_OPEN_SHEET_ID,
  BTN_SHEET_NEXT_ID,
  BTN_SHEET_PREV_ID,
  CLEAR_LOOPS_POPUP_ID,
  LOOP_CONTROL_ID,
  LOOPS_LIST_ID,
  LOOP_STATUS_ID,
  SHEET_CANVAS_ID,
  SHEET_HINT_ID,
  SHEET_PAGE_INFO_ID,
  SHEET_SCREEN_ID,
} from '../../frontend/src/ui/sheet/sheetElementIds.js';

export const CANVAS_WIDTH = 960;
export const CANVAS_HEIGHT = 800;

/** Playwright selector for an element id. */
const qid = (id: string): string => `#${id}`;

export const SHEET_SCREEN = qid(SHEET_SCREEN_ID);
export const OPEN_SHEET_BTN = qid(BTN_OPEN_SHEET_ID);
export const CLOSE_SHEET_BTN = qid(BTN_CLOSE_SHEET_ID);
export const SHEET_PAGE_INFO = qid(SHEET_PAGE_INFO_ID);
export const SHEET_HINT = qid(SHEET_HINT_ID);
export const SHEET_CANVAS = qid(SHEET_CANVAS_ID);
export const SHEET_PREV_BTN = qid(BTN_SHEET_PREV_ID);
export const SHEET_NEXT_BTN = qid(BTN_SHEET_NEXT_ID);
export const DEFINE_LOOP_BTN = qid(BTN_DEFINE_LOOP_ID);
export const ADD_LOOP_BTN = qid(BTN_ADD_LOOP_ID);
export const LOOP_CONTROL = qid(LOOP_CONTROL_ID);
export const LOOP_STATUS = qid(LOOP_STATUS_ID);
export const LOOPS_LIST = qid(LOOPS_LIST_ID);
export const LOOPS_ROW = `${LOOPS_LIST} .loop-row`;
export const LOOPS_ROW_TOGGLE = `${LOOPS_LIST} .loop-row-toggle`;
export const CLEAR_LOOPS_BTN = qid(BTN_CLEAR_LOOPS_ID);
export const CLEAR_LOOPS_POPUP = qid(CLEAR_LOOPS_POPUP_ID);
export const CLEAR_LOOPS_CANCEL_BTN = qid(BTN_CLEAR_LOOPS_CANCEL_ID);
export const CLEAR_LOOPS_OK_BTN = qid(BTN_CLEAR_LOOPS_OK_ID);
