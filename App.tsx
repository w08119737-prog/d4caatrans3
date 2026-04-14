
import React, { useState, useEffect, startTransition } from 'react';
import { FileUpload } from './components/FileUpload';
import { Editor } from './components/Editor';
import { Toolbar } from './components/Toolbar';
import { SystemReport } from './components/SystemReport';
import { UsageStats } from './components/UsageStats';
import { ChangelogModal } from './components/ChangelogModal';
import { DictionaryModal } from './components/DictionaryModal';
import { PromptModal } from './components/PromptModal';
import { ApiKeyModal } from './components/ApiKeyModal';
import { SelectionRange, ViewMode, TextSegment, ApiUsageStats, DictionaryEntry } from './types';
import { translateSelection, translateBatch, DEFAULT_SYSTEM_PROMPT } from './services/geminiService';
import { FileText, Info, Activity, Download, Coins, History, Book, MessageSquareQuote, Key, CheckSquare } from 'lucide-react';

function App() {
  const [content, setContent] = useState<string>("");
  const [fileName, setFileName] = useState<string>("");
  
  const [viewMode, setViewMode] = useState<ViewMode>('smart');
  const [isDragMode, setIsDragMode] = useState(false); // New Drag Mode State
  const [selection, setSelection] = useState<SelectionRange | null>(null);
  const [segments, setSegments] = useState<TextSegment[]>([]);
  
  const [isTranslating, setIsTranslating] = useState(false);
  const [translationProgress, setTranslationProgress] = useState<{ current: number; total: number; percent: number } | null>(null);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [isStatsOpen, setIsStatsOpen] = useState(false);
  const [isChangelogOpen, setIsChangelogOpen] = useState(false);
  const [isDictOpen, setIsDictOpen] = useState(false);
  const [isPromptOpen, setIsPromptOpen] = useState(false);
  const [isApiKeyOpen, setIsApiKeyOpen] = useState(false);
  
  const [history, setHistory] = useState<{ prevContent: string; prevSegments: TextSegment[] } | null>(null);
  const [lastTranslated, setLastTranslated] = useState<{ original: string; translated: string } | null>(null);
  
  // API Key State
  const [apiKey, setApiKey] = useState<string>(() => {
    return localStorage.getItem('aat_api_key') || "";
  });

  useEffect(() => {
    if (apiKey) {
      localStorage.setItem('aat_api_key', apiKey);
    } else {
      localStorage.removeItem('aat_api_key');
    }
  }, [apiKey]);

  // 최초 실행 시 API Key가 없으면 자동으로 설정 모달을 띄움
  useEffect(() => {
    if (!apiKey) {
      setIsApiKeyOpen(true);
    }
  }, []);
  
  // Dictionary State with Persistence
  const [customDictionary, setCustomDictionary] = useState<DictionaryEntry[]>(() => {
    const saved = localStorage.getItem('aat_custom_dict');
    return saved ? JSON.parse(saved) : [];
  });
  
  const [useDefaultDictionary, setUseDefaultDictionary] = useState(true);

  // Persist Dictionary
  useEffect(() => {
    localStorage.setItem('aat_custom_dict', JSON.stringify(customDictionary));
  }, [customDictionary]);

  // Prompt State
  const [systemPrompt, setSystemPrompt] = useState<string>(DEFAULT_SYSTEM_PROMPT);

  // Stats State
  const [apiStats, setApiStats] = useState<ApiUsageStats>({
    requestCount: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalCost: 0
  });

  const handleFileLoaded = (newContent: string, name: string) => {
    setContent(newContent);
    setFileName(name);
    setSelection(null);
    setSegments([]);
    setHistory(null);
    // 내용이 비어있으면 자동으로 편집(raw) 모드로 전환
    setViewMode(newContent.trim() === "" ? 'raw' : 'smart');
    setIsDragMode(false);
  };

  const updateStats = (usage: { inputTokens: number; outputTokens: number; cost: number; requestCount?: number }) => {
    setApiStats(prev => ({
      requestCount: prev.requestCount + (usage.requestCount || 1),
      inputTokens: prev.inputTokens + usage.inputTokens,
      outputTokens: prev.outputTokens + usage.outputTokens,
      totalCost: prev.totalCost + usage.cost
    }));
  };

  const handleDownload = () => {
    if (!content) return;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;

    let downloadName = 'translation.txt';
    if (fileName) {
        const lastDotIndex = fileName.lastIndexOf('.');
        if (lastDotIndex !== -1) {
            const name = fileName.substring(0, lastDotIndex);
            const ext = fileName.substring(lastDotIndex);
            downloadName = `${name}_translated${ext}`;
        } else {
            downloadName = `${fileName}_translated.txt`;
        }
    }
    
    link.download = downloadName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleRawTranslate = async () => {
    if (!selection) return;

    setIsTranslating(true);
    setHistory({ prevContent: content, prevSegments: [] });

    try {
      const { text: translatedText, usage } = await translateSelection(
          selection.text, 
          customDictionary, 
          useDefaultDictionary,
          systemPrompt,
          apiKey
      );
      
      const isUnchanged = translatedText.trim() === selection.text.trim();
      
      const before = content.substring(0, selection.start);
      const after = content.substring(selection.end);
      const newContent = before + translatedText + after;

      setContent(newContent);
      setSegments([]); 
      updateStats(usage);
      
      setLastTranslated({ original: selection.text, translated: translatedText });
      
      if (!isUnchanged) {
        setSelection(null); 
      } else {
        // 원문과 동일한 경우 선택 상태 유지 (길이가 달라졌을 수 있으므로 업데이트)
        setSelection({
          start: selection.start,
          end: selection.start + translatedText.length,
          text: translatedText
        });
      }
    } catch (error: any) {
      alert(`번역 실패: ${error.message || "알 수 없는 오류"}`);
    } finally {
      setIsTranslating(false);
    }
  };

  const handleSmartTranslate = async () => {
    const selectedSegments = segments.filter(s => s.isSelected);
    if (selectedSegments.length === 0) return;

    setIsTranslating(true);
    setTranslationProgress({ current: 0, total: 1, percent: 0 });
    setHistory({ prevContent: content, prevSegments: [...segments] });

    try {
      const textsToTranslate: (string | null)[] = [];
      let lastSelectedIndex = -1;
      
      segments.forEach((s, idx) => {
        if (s.isSelected) {
          // 선택된 세그먼트 사이에 큰 공백(5개 이상의 세그먼트 혹은 빈 줄)이 있으면 끊어줌
          if (lastSelectedIndex !== -1) {
            const gapSegments = segments.slice(lastSelectedIndex + 1, idx);
            // 줄바꿈(newline)이 3개 이상 포함되어 있거나, 아주 큰 세그먼트 차이가 나면 끊어줌
            const newlineCount = gapSegments.reduce((acc, gs) => acc + (gs.text.split('\n').length - 1), 0);
            const hasLargeGap = newlineCount >= 3 || gapSegments.length > 20;
            
            if (hasLargeGap) {
              textsToTranslate.push(null);
            }
          }
          textsToTranslate.push(s.text);
          lastSelectedIndex = idx;
        }
      });
      
      const updateSegmentsWithPartial = (translatedTexts: string[]) => {
        // 성능 최적화: ID 기반 Map을 생성하여 O(1) 조회가 가능하게 함
        const translationMap = new Map();
        selectedSegments.forEach((sel, i) => {
          if (translatedTexts[i] !== undefined) {
            translationMap.set(sel.id, translatedTexts[i]);
          }
        });

        const newSegments = segments.map(s => {
          if (translationMap.has(s.id)) {
            const translatedText = translationMap.get(s.id);
            const isUnchanged = translatedText.trim() === s.text.trim();
            
            return {
              ...s,
              text: translatedText,
              isTranslated: !isUnchanged,
              isSelected: isUnchanged
            };
          }
          return s;
        });

        setSegments(newSegments);
        const newContent = newSegments.map(s => s.text).join('');
        setContent(newContent);
      };

      const { translations: finalTranslations, usage } = await translateBatch(
          textsToTranslate,
          customDictionary, 
          useDefaultDictionary,
          systemPrompt,
          apiKey,
          (progress) => {
            setTranslationProgress({
              current: progress.completedChunks,
              total: progress.totalChunks,
              percent: progress.currentProgress
            });
          },
          (partialTranslations, partialUsage) => {
            updateSegmentsWithPartial(partialTranslations);
            // Update stats in real-time too
            setApiStats(prev => ({
              requestCount: partialUsage.requestCount,
              inputTokens: partialUsage.inputTokens,
              outputTokens: partialUsage.outputTokens,
              totalCost: partialUsage.totalCost
            }));
          }
      );
      
      updateSegmentsWithPartial(finalTranslations);
      updateStats(usage);
      
      setLastTranslated({ original: `${selectedSegments.length} items`, translated: "Done" });

    } catch (error: any) {
      alert(`일괄 번역 실패: ${error.message || "알 수 없는 오류"}`);
      console.error(error);
    } finally {
      setIsTranslating(false);
      setTranslationProgress(null);
    }
  };

  const handleSelectAllJapanese = () => {
    startTransition(() => {
      const newSegments = segments.map(s => 
        (!s.isAutoSelectExcluded && (s.isStrictJapanese || s.isAutoSelected || s.isBoxedDialogue || s.isContextDialogue || s.isArrowBox || s.isVerticalBox || s.isIndentedDialogue || s.isIsolatedDialogue)) ? { ...s, isSelected: true } : s
      );
      setSegments(newSegments);
    });
  };

  const handleUndo = () => {
    if (history) {
      setContent(history.prevContent);
      if (history.prevSegments.length > 0) {
        setSegments(history.prevSegments);
      } else {
        setSegments([]);
      }
      setHistory(null);
      setLastTranslated(null);
    }
  };

  const handleClear = () => {
    setContent("");
    setFileName("");
    setSelection(null);
    setSegments([]);
  };

  return (
    <div className="flex flex-col h-screen w-full">
      <header className="h-14 bg-slate-950 border-b border-slate-800 flex items-center justify-between px-6 shrink-0 z-20">
        <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-1.5 rounded-lg">
                <FileText className="w-5 h-5 text-white" />
            </div>
            <div>
                <h1 className="font-bold text-slate-100 leading-none">AA Translator</h1>
                <div className="flex items-center gap-2 mt-0.5">
                   <span className="text-[10px] text-slate-400 font-mono">GEMINI 3.0 FLASH</span>
                   <span className="w-0.5 h-2.5 bg-slate-700"></span>
                   <button 
                      onClick={() => setIsStatsOpen(true)}
                      className="text-[10px] text-green-400 font-mono flex items-center gap-1 hover:text-green-300 transition-colors"
                      title="예상 비용 보기"
                   >
                      <Coins className="w-3 h-3" />
                      ${apiStats.totalCost.toFixed(6)} (예상)
                   </button>
                </div>
            </div>
        </div>

        <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsApiKeyOpen(true)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border rounded text-xs transition-colors ${apiKey ? 'border-yellow-600/50 text-yellow-500' : 'border-slate-700 text-slate-300'}`}
                  title="API Key 설정"
                >
                  <Key className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Key</span>
                </button>
                <button
                  onClick={() => setIsDictOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded text-xs text-slate-300 transition-colors"
                  title="번역 사전 설정"
                >
                  <Book className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">사전</span>
                </button>
                <button
                  onClick={() => setIsPromptOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded text-xs text-slate-300 transition-colors"
                  title="번역 프롬프트 설정"
                >
                  <MessageSquareQuote className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">프롬프트</span>
                </button>
                <button
                  onClick={() => setIsReportOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded text-xs text-slate-300 transition-colors"
                  title="시스템 로직 보기"
                >
                  <Activity className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Logic</span>
                </button>
                <button
                  onClick={() => setIsChangelogOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded text-xs text-slate-300 transition-colors"
                  title="업데이트 내역 보기"
                >
                  <History className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">History</span>
                </button>
            </div>

            {content && viewMode === 'smart' && (
                <button 
                    onClick={handleSelectAllJapanese}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-medium transition-colors shadow-sm"
                    title="모든 일본어 텍스트 선택"
                >
                    <CheckSquare className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">전체 선택</span>
                </button>
            )}

            {(content || fileName) && (
                <button
                    onClick={handleDownload}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-medium transition-colors shadow-sm"
                    title="번역된 파일 다운로드"
                >
                    <Download className="w-3.5 h-3.5" />
                    <span>다운로드</span>
                </button>
            )}
            
            {fileName && (
                <span className="hidden md:inline-block px-3 py-1 bg-slate-800 rounded-full text-xs text-slate-300 font-mono border border-slate-700 max-w-[150px] truncate">
                    {fileName}
                </span>
            )}
            {fileName && (
                <button 
                    onClick={handleClear}
                    className="text-xs text-red-400 hover:text-red-300 hover:bg-red-400/10 px-2 py-1 rounded transition-colors"
                >
                    닫기
                </button>
            )}
        </div>
      </header>

      <main className="flex-1 overflow-hidden relative bg-[#1a1b26]">
        {!fileName && !content ? (
          <FileUpload onFileLoaded={handleFileLoaded} hasApiKey={!!apiKey} onOpenApiKeyModal={() => setIsApiKeyOpen(true)} />
        ) : (
          <Editor 
            content={content}
            fileName={fileName}
            onChange={setContent} 
            onSelectionChange={setSelection}
            viewMode={viewMode}
            segments={segments}
            onSegmentsChange={setSegments}
            isDragMode={isDragMode}
          />
        )}
      </main>

      <Toolbar 
        selection={selection}
        isTranslating={isTranslating}
        translationProgress={translationProgress}
        onTranslate={handleRawTranslate}
        onClearSelection={() => setSelection(null)}
        lastTranslation={lastTranslated}
        onUndo={handleUndo}
        viewMode={viewMode}
        onChangeViewMode={setViewMode}
        smartSelectionCount={segments.filter(s => s.isSelected).length}
        onSmartTranslate={handleSmartTranslate}
        isDragMode={isDragMode}
        onToggleDragMode={() => setIsDragMode(!isDragMode)}
      />

      <SystemReport isOpen={isReportOpen} onClose={() => setIsReportOpen(false)} />
      <UsageStats isOpen={isStatsOpen} onClose={() => setIsStatsOpen(false)} stats={apiStats} />
      <ChangelogModal isOpen={isChangelogOpen} onClose={() => setIsChangelogOpen(false)} />
      <DictionaryModal 
        isOpen={isDictOpen} 
        onClose={() => setIsDictOpen(false)}
        customDictionary={customDictionary}
        setCustomDictionary={setCustomDictionary}
        useDefaultDictionary={useDefaultDictionary}
        setUseDefaultDictionary={setUseDefaultDictionary}
      />
      <PromptModal
        isOpen={isPromptOpen}
        onClose={() => setIsPromptOpen(false)}
        systemPrompt={systemPrompt}
        setSystemPrompt={setSystemPrompt}
      />
      <ApiKeyModal
        isOpen={isApiKeyOpen}
        onClose={() => setIsApiKeyOpen(false)}
        apiKey={apiKey}
        setApiKey={setApiKey}
      />
      
      <div className="fixed bottom-4 right-4 z-40">
        <div className="group relative">
            <div className="bg-slate-800 p-2 rounded-full text-slate-400 hover:text-white cursor-help shadow-lg border border-slate-700">
                <Info className="w-5 h-5" />
            </div>
            <div className="absolute bottom-full right-0 mb-2 w-72 bg-slate-900 border border-slate-700 p-4 rounded-lg shadow-xl text-xs text-slate-300 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity">
                <p className="font-bold text-slate-100 mb-2">사용 가이드</p>
                <div className="space-y-2">
                    <div>
                        <span className="font-semibold text-blue-400">선택 모드</span>
                        <p>번역하려는 텍스트를 클릭하여 선택하세요.</p>
                        <p className="mt-1">하단 툴바의 <span className="text-slate-100 bg-slate-700 px-1 rounded">드래그</span> 버튼을 켜면 박스 드래그로 여러 줄을 한 번에 선택할 수 있습니다.</p>
                    </div>
                    <div>
                        <span className="font-semibold text-green-400">사전 기능</span>
                        <p>상단의 [사전] 메뉴에서 나만의 번역 규칙을 추가하고 저장/복원할 수 있습니다.</p>
                    </div>
                    <div>
                        <span className="font-semibold text-yellow-400">API Key</span>
                        <p>기본 할당량을 초과하거나 개인 계정을 사용하고 싶다면 상단 [Key] 메뉴에서 API Key를 등록하세요.</p>
                    </div>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
}

export default App;
