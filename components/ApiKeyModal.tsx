
import React, { useState, useEffect } from 'react';
import { X, Key, Save, ExternalLink, Trash2, CheckCircle2 } from 'lucide-react';

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  apiKey: string;
  setApiKey: (key: string) => void;
}

export const ApiKeyModal: React.FC<ApiKeyModalProps> = ({
  isOpen,
  onClose,
  apiKey,
  setApiKey,
}) => {
  const [inputValue, setInputValue] = useState('');

  useEffect(() => {
    if (isOpen) {
      setInputValue(apiKey);
    }
  }, [isOpen, apiKey]);

  if (!isOpen) return null;

  const handleSave = () => {
    setApiKey(inputValue.trim());
    onClose();
  };

  const handleClear = () => {
    setInputValue('');
    setApiKey('');
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-slate-800">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Key className="w-5 h-5 text-yellow-400" />
            API Key 설정
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-300">Google Gemini API Key</label>
            <input
              type="password"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="AIzaSy..."
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-slate-100 placeholder:text-slate-600 focus:border-yellow-500 focus:outline-none font-mono text-sm"
            />
            <p className="text-xs text-slate-500">
              * 키는 브라우저(Local Storage)에만 저장되며 서버로 전송되지 않습니다.
            </p>
          </div>

          <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700 text-xs text-slate-400 space-y-2">
            <p className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
              <span>본인의 API Key를 입력하면 기본 할당량 제한 없이 개인 쿼터로 이용할 수 있습니다.</span>
            </p>
            <div className="pt-2 mt-2 border-t border-slate-700/50">
              <a 
                href="https://aistudio.google.com/app/apikey" 
                target="_blank" 
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-blue-400 hover:underline"
              >
                API Key 발급받기 (Google AI Studio)
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-slate-800 bg-slate-900/50 rounded-b-2xl flex justify-end gap-3">
          {apiKey && (
            <button
              onClick={handleClear}
              className="flex items-center gap-2 px-4 py-2 text-red-400 hover:bg-red-900/20 rounded-lg text-sm font-medium transition-colors mr-auto"
            >
              <Trash2 className="w-4 h-4" />
              키 삭제
            </button>
          )}
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-400 hover:text-white text-sm transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-5 py-2 bg-yellow-600 hover:bg-yellow-500 text-white rounded-lg text-sm font-medium transition-colors shadow-lg shadow-yellow-900/20"
          >
            <Save className="w-4 h-4" />
            저장
          </button>
        </div>
      </div>
    </div>
  );
};
