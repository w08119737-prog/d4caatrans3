
import { GoogleGenAI } from "@google/genai";
import { DictionaryEntry } from "../types";

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
Do not add filler text or explanations.`;

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

const getClient = (apiKey?: string) => {
  // 사용자가 입력한 키를 우선적으로 사용
  let key = apiKey?.trim();
  
  // 환경변수가 주입되지 않은 경우를 대비해 안전하게 체크
  if (!key) {
    try {
      // Vite define을 제거했으므로 브라우저에서는 undefined가 될 것임
      key = (import.meta as any).env?.VITE_GEMINI_API_KEY || (process.env as any)?.GEMINI_API_KEY || (process.env as any)?.API_KEY;
    } catch (e) {
      // process.env가 정의되지 않은 경우 무시
    }
  }

  if (!key) {
    throw new Error("API Key가 설정되지 않았습니다. 우측 상단 [Key] 메뉴를 눌러 API Key를 입력해주세요.");
  }
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
  texts: string[],
  customDict: DictionaryEntry[] = [], 
  useDefaultDict: boolean = true,
  systemInstruction: string = DEFAULT_SYSTEM_PROMPT,
  apiKey?: string
): Promise<BatchTranslationResult> => {
  if (texts.length === 0) return { translations: [], usage: { inputTokens: 0, outputTokens: 0, requestCount: 0, cost: 0 } };
  
  const ai = getClient(apiKey);
  const dictPrompt = generateDictionaryPrompt(customDict, useDefaultDict);

  // Strategy: Sequential Processing with Throttling
  // Reverted chunk sizes to original values (200 items / 4000 chars) as requested.
  // Instead of reducing chunk size, we rely on strict sequential processing and delays
  // to avoid "Excessive Demand" errors.
  const MAX_CHARS_PER_CHUNK = 4000; 
  const MAX_ITEMS_PER_CHUNK = 200;   
  const BASE_DELAY_MS = 1000; // 1s delay between chunks to ensure stability

  const chunks: string[][] = [];
  let currentChunk: string[] = [];
  let currentChunkLength = 0;

  for (const text of texts) {
    const textLen = text.length;

    if (currentChunk.length > 0 && 
       (currentChunkLength + textLen > MAX_CHARS_PER_CHUNK || currentChunk.length >= MAX_ITEMS_PER_CHUNK)) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentChunkLength = 0;
    }

    currentChunk.push(text);
    currentChunkLength += textLen;
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  let allTranslations: string[] = [];
  let totalInput = 0;
  let totalOutput = 0;
  let requestCount = 0;

  // Process chunks sequentially
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    requestCount++;
    
    let attempts = 0;
    const maxRetries = 3;
    let success = false;
    let chunkResult: string[] = [];

    while (!success && attempts < maxRetries) {
      try {
        // Backoff for retries
        if (attempts > 0) {
            const waitTime = 2000 * Math.pow(2, attempts); 
            console.log(`Retrying chunk ${i+1}/${chunks.length} (Attempt ${attempts + 1}) after ${waitTime}ms...`);
            await delay(waitTime);
        }

        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: `${systemInstruction}
            TECHNICAL CONSTRAINT: Output must be a valid JSON array of strings. 
            CRITICAL: The output array must have exactly ${chunk.length} items. Do not skip any items.
            Maintain the exact order of the input array.
            ${dictPrompt}
            Input Array: ${JSON.stringify(chunk)}`,
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

        // Strict Validation: Ensure we got exactly what we asked for
        if (Array.isArray(parsed)) {
            if (parsed.length !== chunk.length) {
                // If length mismatch, trigger retry
                throw new Error(`Length Mismatch: Expected ${chunk.length}, got ${parsed.length}.`);
            }
            chunkResult = parsed.map(String);
            
            totalInput += response.usageMetadata?.promptTokenCount || 0;
            totalOutput += response.usageMetadata?.candidatesTokenCount || 0;
            success = true;
        } else {
            throw new Error("Response is not an array");
        }

      } catch (error: any) {
        attempts++;
        console.warn(`Chunk ${i+1} failed:`, error.message);
        
        // Handle 429 (Rate Limit) specifically with longer wait
        if (error.status === 429 || (error.response && error.response.status === 429)) {
           await delay(5000 * attempts); 
        }
      }
    }

    if (success) {
        allTranslations = [...allTranslations, ...chunkResult];
    } else {
        // Fallback: Use original text for this chunk if all retries fail
        // This prevents the entire translation from failing due to one bad chunk
        console.error(`Failed to translate chunk ${i+1} after ${maxRetries} attempts.`);
        allTranslations = [...allTranslations, ...chunk]; 
    }

    // Throttling: Add delay between successful chunks to prevent rate limiting
    if (i < chunks.length - 1) {
        await delay(BASE_DELAY_MS);
    }
  }

  return { 
    translations: allTranslations, 
    usage: {
      inputTokens: totalInput,
      outputTokens: totalOutput,
      requestCount,
      cost: calculateCost(totalInput, totalOutput)
    }
  };
};
