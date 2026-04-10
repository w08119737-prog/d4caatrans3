
export interface SelectionRange {
  start: number;
  end: number;
  text: string;
}

export interface TranslationHistoryItem {
  original: string;
  translated: string;
  timestamp: number;
}

export enum AppState {
  IDLE,
  FILE_LOADED,
  PROCESSING,
}

export interface TextSegment {
  id: string;
  text: string;
  original: string;
  isJapanese: boolean;
  isStrictJapanese?: boolean;
  isAutoSelected?: boolean;
  isBoxedDialogue?: boolean;
  isContextDialogue?: boolean;
  isArrowBox?: boolean;
  isVerticalBox?: boolean;
  isIndentedDialogue?: boolean;
  isIsolatedDialogue?: boolean;
  isSelected: boolean;
  isTranslated: boolean;
}

export type ViewMode = 'raw' | 'smart' | 'viewer';

export interface ApiUsageStats {
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  totalCost: number;
}

export interface DictionaryEntry {
  id: string;
  original: string;
  translated: string;
}