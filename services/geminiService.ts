
import { GoogleGenAI } from "@google/genai";
import { DictionaryEntry, ApiUsageStats } from "../types";

// Estimated Pricing based on Gemini 3.0 Flash Tier
// Input: $0.50 per 1M tokens / Output: $3.00 per 1M tokens
const COST_PER_1M_INPUT_TOKENS = 0.50; 
const COST_PER_1M_OUTPUT_TOKENS = 3.00;

export const DEFAULT_DICTIONARY: DictionaryEntry[] = [
  { id: 'def-1', original: 'やる夫', translated: '야루오' },
  { id: 'def-2', original: 'やらない夫', translated: '야라나이오' },
  { id: 'def-3', original: 'できない子', translated: '데키나이코' },
  { id: 'def-4', original: 'できる夫', translated: '데키루오' },
  { id: 'def-5', original: 'できる子', translated: '데키루코' },
  { id: 'def-6', original: 'やらない子', translated: '야라나이코' },
  { id: 'def-7', original: 'きらない夫', translated: '키라나이오' },
  { id: 'def-8', original: 'ドクオ', translated: '도쿠오' },
  { id: 'def-9', original: '独男', translated: '도쿠오' },
  { id: 'def-10', original: 'ショボーン', translated: '쇼본' },
  { id: 'def-11', original: '荒巻スカルチノフ', translated: '아라마키 스칼치노프' },
  { id: 'def-12', original: 'モナー', translated: '모나' },
  { id: 'def-13', original: 'ギコ猫', translated: '기코네코' },
  { id: 'def-14', original: 'ギコ', translated: '기코' },
  { id: 'def-15', original: 'しぃ', translated: '시이' },
];

export const DEFAULT_SYSTEM_PROMPT = `You are a specialized translator for Japanese ASCII Art (AA) / Shift-JIS Art context.
Translate the text into natural, concise Korean suitable for internet communities.
Handle internet slang, onomatopoeia, and character dialogue appropriately.

STRICT 1:1 MAPPING (NO MERGING):
- You must translate each item exactly at its given index. 
- DO NOT merge, cluster, or combine multiple input items into a single output index.
- DO NOT try to mimic the "fragmented" style or the exact length of the input (e.g., do not translate "오하이오" into "안 녀 어 엉").
- Translate each fragment naturally as Korean syllables. If a fragment becomes redundant, use an empty string ("").
- The total number of output items MUST exactly match the input items.
- Do not add filler text or explanations.`;

export interface TranslationResponseData {
  text: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cost: number;
  };
}

export interface BatchTranslationResult {
  translations: string[];
  usage: {
    inputTokens: number;
    outputTokens: number;
    requestCount: number;
    cost: number;
  };
}

export interface TranslationProgress {
  totalChunks: number;
  completedChunks: number;
  currentProgress: number; // 0 to 100
}

const getClient = (apiKey?: string) => {
  // 사용자가 입력한 키를 우선적으로 사용
  let key = apiKey?.trim();
  let source = "User-provided Key";
  
  // 환경변수가 주입되지 않은 경우를 대비해 안전하게 체크
  if (!key) {
    try {
      key = (import.meta as any).env?.VITE_GEMINI_API_KEY || (process.env as any)?.GEMINI_API_KEY || (process.env as any)?.API_KEY;
      source = "System Default Key";
    } catch (e) {
      // process.env가 정의되지 않은 경우 무시
    }
  }

  if (!key) {
    throw new Error("API Key가 설정되지 않았습니다. 우측 상단 [Key] 메뉴를 눌러 API Key를 입력해주세요.");
  }
  
  console.log(`[Gemini] Using ${source} (${key.substring(0, 6)}...)`);
  return new GoogleGenAI({ apiKey: key });
};

const calculateCost = (input: number, output: number): number => {
  const inputCost = (input / 1_000_000) * COST_PER_1M_INPUT_TOKENS;
  const outputCost = (output / 1_000_000) * COST_PER_1M_OUTPUT_TOKENS;
  return inputCost + outputCost;
};

const generateDictionaryPrompt = (customDict: DictionaryEntry[], useDefault: boolean): string => {
  let terms: string[] = [];
  
  if (useDefault) {
    terms = [...terms, ...DEFAULT_DICTIONARY.map(d => `${d.original} -> ${d.translated}`)];
  }
  
  if (customDict.length > 0) {
    terms = [...terms, ...customDict.map(d => `${d.original} -> ${d.translated}`)];
  }

  if (terms.length === 0) return "";

  return `\nTERMINOLOGY RULES (Apply strictly):\n${terms.join('\n')}\n`;
};

// Helper for delays
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const translateSelection = async (
  textToTranslate: string, 
  customDict: DictionaryEntry[] = [], 
  useDefaultDict: boolean = true,
  systemInstruction: string = DEFAULT_SYSTEM_PROMPT,
  apiKey?: string
): Promise<TranslationResponseData> => {
  try {
    const ai = getClient(apiKey);
    const dictPrompt = generateDictionaryPrompt(customDict, useDefaultDict);
    
    // Upgraded to Gemini 3.0 Flash Preview
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `${systemInstruction}
      ${dictPrompt}
      Text to translate: "${textToTranslate}"`,
    });

    const text = response.text?.trim() || textToTranslate;
    
    const inputTokens = response.usageMetadata?.promptTokenCount || 0;
    const outputTokens = response.usageMetadata?.candidatesTokenCount || 0;
    
    return { 
      text, 
      usage: {
        inputTokens,
        outputTokens,
        cost: calculateCost(inputTokens, outputTokens)
      }
    };
  } catch (error) {
    console.error("Translation failed:", error);
    throw error;
  }
};

export const translateBatch = async (
  texts: (string | null)[],
  customDict: DictionaryEntry[] = [], 
  useDefaultDict: boolean = true,
  systemInstruction: string = DEFAULT_SYSTEM_PROMPT,
  apiKey?: string,
  onProgress?: (progress: TranslationProgress) => void,
  onPartialResult?: (translations: string[], usage: ApiUsageStats) => void
): Promise<BatchTranslationResult> => {
  const nonNullTexts = texts.filter((t): t is string => t !== null);
  if (nonNullTexts.length === 0) return { translations: [], usage: { inputTokens: 0, outputTokens: 0, requestCount: 0, cost: 0 } };
  
  const ai = getClient(apiKey);
  const dictPrompt = generateDictionaryPrompt(customDict, useDefaultDict);

  const SOFT_CHARS_LIMIT = 8000;
  const HARD_CHARS_LIMIT = 12000;
  const SOFT_ITEMS_LIMIT = 400;
  const HARD_ITEMS_LIMIT = 600;

  const chunks: string[][] = [];
  const chunkGaps: number[][] = []; // 각 청크 내에서 큰 공백(null) 직후에 오는 텍스트의 인덱스를 기록
  let currentChunk: string[] = [];
  let currentGaps: number[] = [];
  let currentChunkLength = 0;
  let hasPendingGap = false;

  for (const text of texts) {
    if (text === null) {
      hasPendingGap = true;
      // SOFT LIMIT: 8000자 혹은 400개 이상 쌓였을 때 공백을 만나면 끊어줌
      if (currentChunkLength >= SOFT_CHARS_LIMIT || currentChunk.length >= SOFT_ITEMS_LIMIT) {
        chunks.push(currentChunk);
        chunkGaps.push(currentGaps);
        currentChunk = [];
        currentGaps = [];
        currentChunkLength = 0;
        hasPendingGap = false;
      }
      continue;
    }

    if (hasPendingGap && currentChunk.length > 0) {
      currentGaps.push(currentChunk.length);
      hasPendingGap = false;
    }

    const textLen = text.length;

    // HARD LIMIT: 12000자 혹은 600개 항목을 넘으면 강제로 끊어줌
    if (currentChunk.length > 0 && 
       (currentChunkLength + textLen > HARD_CHARS_LIMIT || currentChunk.length >= HARD_ITEMS_LIMIT)) {
      chunks.push(currentChunk);
      chunkGaps.push(currentGaps);
      currentChunk = [];
      currentGaps = [];
      currentChunkLength = 0;
    }

    currentChunk.push(text);
    currentChunkLength += textLen;
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
    chunkGaps.push(currentGaps);
  }

  const totalChunks = chunks.length;
  let completedChunks = 0;
  let totalInput = 0;
  let totalOutput = 0;
  let requestCount = 0;

  // Initialize results array with original texts (as fallback)
  const results: string[][] = chunks.map(chunk => [...chunk]);

  // Helper to process a single chunk
  const processChunk = async (chunk: string[], index: number) => {
    let attempts = 0;
    const maxRetries = 3;
    let success = false;
    let chunkResult: string[] = [];
    const gaps = chunkGaps[index];

    while (!success && attempts < maxRetries) {
      try {
        if (attempts > 0) {
          const waitTime = 2000 * Math.pow(2, attempts); 
          await delay(waitTime);
        }

        // 청크 내부에 스레드 헤더가 있는지 확인하여 프롬프트에 힌트 제공
        const threadHeaders = chunk
          .map((t, i) => /^\d{4}\s*：\s*◆/.test(t) ? i : -1)
          .filter(i => i !== -1);

        const threadHint = threadHeaders.length > 0 
          ? `\nNOTE: This chunk contains multiple posts. Thread headers are at indices: ${threadHeaders.join(', ')}. Treat each post as a separate context.\n`
          : "";

        const gapHint = gaps.length > 0
          ? `\nNOTE: There are large physical gaps (empty lines/images) in the original document immediately BEFORE the following indices: ${gaps.join(', ')}. Text before and after these gaps are physically distant.\n`
          : "";

        const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview', // 사용자의 요청에 따라 최신 3.0 Flash Preview 모델로 변경
          contents: `${systemInstruction}
          
          TECHNICAL CONSTRAINT: Output MUST be a valid JSON object where keys are the exact indices (0, 1, 2...) of the input array.
          CRITICAL: You MUST provide a key for EVERY index from 0 to ${chunk.length - 1}.
          ${threadHint}${gapHint}
          
          STRICT 1:1 MAPPING RULE (NO MERGING):
          1. Translate each item strictly in its own index. 
          2. DO NOT merge consecutive items into the first index. Each index must stand on its own.
          3. DO NOT try to match the "fragmented" style of the source. For example, translate vertical Japanese characters into natural Korean syllables, not broken characters.
          4. You may output an empty string ("") ONLY IF the fragment is redundant or has no meaning.
          
          ${dictPrompt}
          Input Array: ${JSON.stringify(chunk)}`,
          config: {
            temperature: 0.1, 
            responseMimeType: "application/json",
          }
        });

        const rawText = response.text?.trim();
        const jsonStr = rawText?.replace(/```json|```/g, '').trim();

        if (!jsonStr) throw new Error("Empty response from AI");

        let parsed;
        try {
          parsed = JSON.parse(jsonStr);
        } catch (e) {
          throw new Error("Invalid JSON response");
        }

        // 인덱스 기반 매핑으로 배열 재구성 (개수 불일치 문제 해결)
        chunkResult = new Array(chunk.length).fill("");
        
        if (Array.isArray(parsed)) {
          // 배열로 왔을 경우 기존 방식대로 매핑 (최대한 살림)
          for (let i = 0; i < Math.min(parsed.length, chunk.length); i++) {
            chunkResult[i] = String(parsed[i]);
          }
        } else if (typeof parsed === 'object' && parsed !== null) {
          // 객체로 왔을 경우 인덱스에 맞춰 매핑
          for (let i = 0; i < chunk.length; i++) {
            if (parsed[i] !== undefined) {
              chunkResult[i] = String(parsed[i]);
            } else if (parsed[String(i)] !== undefined) {
              chunkResult[i] = String(parsed[String(i)]);
            }
          }
        } else {
          throw new Error("Response is not an array or object");
        }

        success = true;
        results[index] = chunkResult;

        // Report partial result
        if (onPartialResult) {
          const allCurrentTranslations = results.flat();
          onPartialResult(allCurrentTranslations, {
            requestCount,
            inputTokens: totalInput,
            outputTokens: totalOutput,
            totalCost: calculateCost(totalInput, totalOutput)
          });
        }

      } catch (error: any) {
        attempts++;
        console.warn(`Chunk ${index + 1} failed:`, error.message);
        if (error.status === 429 || (error.response && error.response.status === 429)) {
          await delay(5000 * attempts); 
        }
      }
    }

    completedChunks++;
    if (onProgress) {
      onProgress({
        totalChunks,
        completedChunks,
        currentProgress: Math.round((completedChunks / totalChunks) * 100)
      });
    }
  };

  // ------------------------------------------------------------------------
  // [무료 티어 안전 모드]
  // Google Gemini API 무료 티어는 1분에 최대 15회 요청(15 RPM)으로 제한됩니다.
  // 이를 초과하지 않기 위해 한 번에 1개씩, 4초 간격으로 요청을 보냅니다.
  // (유료 티어 사용 시 이 제한을 풀고 CONCURRENCY_LIMIT을 높일 수 있습니다)
  // ------------------------------------------------------------------------
  const CONCURRENCY_LIMIT = 1; 
  const START_DELAY_MS = 4000; 
  
  for (let i = 0; i < chunks.length; i += CONCURRENCY_LIMIT) {
    const batch = chunks.slice(i, i + CONCURRENCY_LIMIT);
    const promises = batch.map(async (chunk, batchIndex) => {
      const globalIndex = i + batchIndex;
      await delay(batchIndex * START_DELAY_MS);
      return processChunk(chunk, globalIndex);
    });
    
    await Promise.all(promises);
    
    if (i + CONCURRENCY_LIMIT < chunks.length) {
      await delay(START_DELAY_MS);
    }
  }

  const finalTranslations = results.flat();

  return { 
    translations: finalTranslations, 
    usage: {
      inputTokens: totalInput,
      outputTokens: totalOutput,
      requestCount,
      cost: calculateCost(totalInput, totalOutput)
    }
  };
};
