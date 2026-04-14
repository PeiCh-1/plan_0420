import React, { useState, useEffect } from 'react';
import { useAppContext } from '../store/AppContext';
import { Activity, Wand2, Download, AlertCircle, RefreshCw, FileText } from 'lucide-react';
import { IgpAdjustment, IgpPlan } from '../types';
import learningPerformancesData from '../data/learning_performances.json';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { exportIgpToWord } from '../utils/wordExport';

export default function IgpAdjustments() {
  const { state, setIgpA1, setIgpA2 } = useAppContext();
  const { settings, apiKey, lessonsA1, lessonsA2, igpA1, igpA2 } = state;
  const [activeCourseId, setActiveCourseId] = useState<'A1'|'A2'>('A1');
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const activeLessons = activeCourseId === 'A1' ? lessonsA1 : lessonsA2;
  const activeIgp = activeCourseId === 'A1' ? igpA1 : igpA2;
  const setActiveIgp = activeCourseId === 'A1' ? setIgpA1 : setIgpA2;
  const currentCourseSettings = settings.courses.find(c => c.id === activeCourseId);

  // 1. 自動同步課程計畫指標到 IGP
  useEffect(() => {
    if (!activeIgp) return;

    // 從課程計畫提取所有指標碼
    const planIndicatorCodes = Array.from(new Set(activeLessons.flatMap(l => l.learningPerformances)));
    
    // 建立最新的調整清單
    const updatedAdjustments: IgpAdjustment[] = planIndicatorCodes.map(code => {
      // 尋找現有的 IGP 調整紀錄 (保留已生成的 AI 建議)
      const existingAdj = activeIgp.adjustments.find(a => a.indicatorCode === code);
      
      // 從課程計畫抓取「初步調整描述」
      let preliminaryDesc = '';
      for (const lesson of activeLessons) {
        const adj = lesson.performanceAdjustments?.[code];
        if (adj?.adjusted && adj.adjustedDesc) {
          preliminaryDesc = adj.adjustedDesc;
          break;
        }
      }

      // 如果課程計畫沒調整，則用原始指標
      const original = learningPerformancesData.find((d: any) => d.code === code);
      const baseContent = preliminaryDesc || original?.content || '未知指標';

      return {
        indicatorCode: code,
        originalDesc: baseContent, // 這裡的 originalDesc 實際上代表「課程層級調整後」的版本
        adjustedDesc: existingAdj?.adjustedDesc || '', // 這是保留給 IGP 頁面 AI 生成的內容
        contentStrategy: existingAdj?.contentStrategy || [],
        processStrategy: existingAdj?.processStrategy || [],
        environmentStrategy: existingAdj?.environmentStrategy || [],
        assessmentStrategy: existingAdj?.assessmentStrategy || []
      };
    });

    // 檢查是否真的需要更新，避免無限迴圈
    const currentCodesJson = JSON.stringify(activeIgp.adjustments.map(a => a.indicatorCode + a.originalDesc));
    const newCodesJson = JSON.stringify(updatedAdjustments.map(a => a.indicatorCode + a.originalDesc));

    if (currentCodesJson !== newCodesJson) {
      setActiveIgp({ ...activeIgp, adjustments: updatedAdjustments });
    }
  }, [activeLessons, activeIgp?.studentStatus, activeCourseId]);

  // Initialize IGP state if null (kept for stability)
  useEffect(() => {
    if (!activeIgp) {
      setActiveIgp({
        studentStatus: '',
        adjustments: [],
        globalContentStrategy: [],
        globalProcessStrategy: [],
        globalEnvironmentStrategy: [],
        globalAssessmentStrategy: []
      });
    }
  }, [activeCourseId]);

  const handleStatusChange = (status: string) => {
    if (!activeIgp) return;
    setActiveIgp({ ...activeIgp, studentStatus: status });
  };

  const handleAdjustmentChange = (index: number, field: keyof IgpAdjustment, value: any) => {
    if (!activeIgp) return;
    const newAdjs = [...activeIgp.adjustments];
    newAdjs[index] = { ...newAdjs[index], [field]: value };
    setActiveIgp({ ...activeIgp, adjustments: newAdjs });
  };

  const handleGlobalStrategyToggle = (stratType: 'globalContentStrategy'|'globalProcessStrategy'|'globalEnvironmentStrategy'|'globalAssessmentStrategy', value: string) => {
    if (!activeIgp) return;
    let arr = [...activeIgp[stratType] || []];
    if (arr.includes(value)) arr = arr.filter(v => v !== value);
    else arr.push(value);
    setActiveIgp({ ...activeIgp, [stratType]: arr });
  };

  const generateIgpWithAI = async () => {
    if (!apiKey) { setErrorMsg('請先至基本設定填寫 Gemini API 密鑰！'); return; }
    if (activeIgp?.adjustments.length === 0) {
      setErrorMsg('該課程尚未在「課程規劃」挑選任何學習表現指標，請先完成課程規劃！');
      return;
    }
    if (!activeIgp?.studentStatus) { setErrorMsg('請先填寫學生的狀況描述！'); return; }
    
    setIsGenerating(true);
    setErrorMsg('');

    try {
      const genAI = new GoogleGenerativeAI(apiKey);

      // 這裡指標描述已經是「課程規劃調整後」的結果了
      const indicatorsText = activeIgp.adjustments.map(ind => `[${ind.indicatorCode}] ${ind.originalDesc}`).join('\n');

      const prompt = `您是一位特殊教育與資優教育專家。請根據已初步進行過「課程層級調整」的指標，針對學生的「個別特質」進行二次差異化設計。

【學生狀態與個別化調整需求】
${activeIgp.studentStatus}

【課程規劃已調整之學習表現指標】
${indicatorsText}

【二次調整原則】
1. 指標選用：請從上方清單中『精選 3 ~ 6 項』與該生最切身的指標進行更深入的個別化改寫。
2. 二次改寫語法：**必須以原始指標內容為底稿進行增修調整，嚴禁完全改寫或推翻原先文句**。
   - **實質改寫原則**：調整修正應具備資優策略（如加深加廣、高層次思考描述指標），例如將「創作故事」改為「應用創意技法創作故事」。**絕對禁止僅做不具專業量體之名詞微調**（如多元文本改為故事文本）。
   - **正確格式規範 (極度重要)**：每一項變動必須「左右對稱且完整」。新增為 \`[+內容+]\`，刪除為 \`[-內容-]\`。
   - **嚴禁行為**：嚴禁在 \`[+\` 之後加逗號（如 \`[+,\`），嚴禁起頭與結尾符號不一（如 \`[+內容-]\`）。
   - **原則**：標點符號（如句號、逗號）應視為同一修正段落文字。**請將標點符號包含在括號內（預防出現多餘括號）。**
3. 調整策略：為挑選的指標，**必須從內容、歷程、環境、評量四面向中「各」挑選 1~3 項（嚴禁漏掉任何一個面向，且不超過 3 項）** 最適合此學生的策略目標。

請回傳陣列 JSON 物件：
[
  {
    "indicatorCode": "指標代碼",
    "adjustedDesc": "針對學生特質進一步調整後的文字",
    "contentStrategy": ["加深"],
    "processStrategy": ["高層次思考"],
    "environmentStrategy": [...],
    "assessmentStrategy": [...]
  }
]`;

      const callAiWithFallback = async (modelName: string): Promise<any> => {
        try {
          const model = genAI.getGenerativeModel(
            { model: modelName },
            { apiVersion: 'v1' }
          );
          return await model.generateContent(prompt);
        } catch (err: any) {
          if (modelName === 'gemini-2.5-flash' && (err.message?.includes('503') || err.message?.includes('high demand'))) {
            if (window.confirm("Gemini 2.5 目前負載過高，是否切換至 1.5 版本繼續生成？")) {
              return await callAiWithFallback('gemini-1.5-flash');
            }
          }
          throw err;
        }
      };

      const result = await callAiWithFallback('gemini-2.5-flash');
      const rawText = result.response.text();
      
      // --- 強化的 JSON 提取器 (Robust JSON Extractor) ---
      const extractJson = (text: string) => {
        // 1. 優先嘗試尋找 Markdown JSON 區塊
        const markdownMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (markdownMatch) return markdownMatch[1].trim();

        // 2. 尋找第一個 [ 或 { 以及最後一個 ] 或 }
        const start = Math.min(
          text.indexOf('[') === -1 ? Infinity : text.indexOf('['),
          text.indexOf('{') === -1 ? Infinity : text.indexOf('{')
        );
        const end = Math.max(text.lastIndexOf(']'), text.lastIndexOf('}'));
        
        if (start !== Infinity && end !== -1 && start < end) {
          return text.substring(start, end + 1).trim();
        }
        return text.trim();
      };

      const responseText = extractJson(rawText);
      
      // --- AI 語法自動校正器 (Sanitizer) - 精準校正版 v1.2 ---
      const sanitizeAiMarkers = (text: string) => {
        if (!text) return '';
        let sanitized = text
          // 1. 修正對稱性錯誤: [+文字-] -> [+文字+] / [-文字+] -> [-文字-]
          .replace(/\[\+([^\]]+)\-\]/g, '[+$1+]')
          .replace(/\[\-([^\]]+)\+\]/g, '[-$1-]')
          // 2. 修正標籤內多餘標點: [+, 文字] -> [+文字+]
          .replace(/\[\+\s*[,，、]?/g, '[+')
          .replace(/\[\-\s*[,，、]?/g, '[-')
          // 3. 補齊代碼區塊常見缺少次級符號: [+文字] -> [+文字+] / [-文字] -> [-文字-]
          .replace(/\[\+([^\]\+\-]+)\]/g, '[+$1+]')
          .replace(/\[\-([^\]\+\-]+)\]/g, '[-$1-]')
          // 4. 修正重複或錯誤結尾: [+文字+]] -> [+文字+]
          .replace(/\[\+([^\]]+)\+\]\]/g, '[+$1+]')
          .replace(/\[\-([^\]]+)\-\]\]/g, '[-$1-]')
          // 5. 修正標點溢出吸附: [+文字+]。] -> [+文字。+]
          .replace(/\[\+([^\]]+)\+\]([。，、；：！？])\]/g, '[+$1$2+]')
          .replace(/\[\-([^\]]+)\-\]([。，、；：！？])\]/g, '[-$1$2-]')
          // 6. 處理常見 AI 語意結尾多出的孤兒括號: 文字] -> 文字
          .replace(/([。，、；：！？])\s*\]\s*$/g, '$1');

        return sanitized
          // 確保標點後括號內部沒有多餘空格
          .replace(/\[\+ /g, '[+').replace(/ \+\]/g, '+]')
          .replace(/\[\- /g, '[-').replace(/ \-\]/g, '-]');
      };

      const generatedPlan = JSON.parse(responseText);

      const newAdjustments = activeIgp.adjustments.map(adj => {
        const gen = generatedPlan.find((g: any) => g.indicatorCode === adj.indicatorCode);
        if (!gen) return adj;
        return {
          ...adj,
          adjustedDesc: sanitizeAiMarkers(gen.adjustedDesc || adj.adjustedDesc),
          contentStrategy: gen.contentStrategy || [],
          processStrategy: gen.processStrategy || [],
          environmentStrategy: gen.environmentStrategy || [],
          assessmentStrategy: gen.assessmentStrategy || []
        };
      });

      const globalContent = Array.from(new Set(generatedPlan.flatMap((g:any) => g.contentStrategy || []))) as string[];
      const globalProcess = Array.from(new Set(generatedPlan.flatMap((g:any) => g.processStrategy || []))) as string[];
      const globalEnv = Array.from(new Set(generatedPlan.flatMap((g:any) => g.environmentStrategy || []))) as string[];
      const globalAssess = Array.from(new Set(generatedPlan.flatMap((g:any) => g.assessmentStrategy || []))) as string[];

      setActiveIgp({ 
        ...activeIgp, 
        adjustments: newAdjustments,
        globalContentStrategy: globalContent,
        globalProcessStrategy: globalProcess,
        globalEnvironmentStrategy: globalEnv,
        globalAssessmentStrategy: globalAssess
      });

    } catch (err: any) {
      console.error(err);
      setErrorMsg('生成失敗，請確認 API Key 是否正確及學生狀態描述。' + (err.message || ''));
    } finally {
      setIsGenerating(false);
    }
  };

  const renderAdjustedHtml = (text: string) => {
    return {
      __html: text
        .replace(/\[\+([^\]]+)\+\]/g, '<span class="text-emerald-700 font-bold bg-emerald-100 px-1 rounded mx-0.5">+$1</span>')
        .replace(/\[\-([^\]]+)\-\]/g, '<span class="text-red-500 bg-red-100 line-through px-1 rounded mx-0.5">-$1</span>')
    };
  };

  if (!activeIgp) return null;

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-800 tracking-tight flex items-center gap-2">
            <Activity className="text-fuchsia-600" /> IGP 個別調整
          </h1>
          <p className="text-gray-500 mt-1">針對個別學生需求，由 AI 協助篩選並改寫適用指標，擬定四大面向調整策略。</p>
        </div>
        
        <div className="flex flex-wrap gap-2">
          {settings.isTwoCourses && (
            <div className="flex p-1 bg-gray-200/50 rounded-lg mr-2">
              <button 
                className={`px-4 py-2 rounded-md font-bold transition-all ${activeCourseId === 'A1' ? 'bg-white shadow text-fuchsia-700' : 'text-gray-500 hover:text-gray-700'}`}
                onClick={() => setActiveCourseId('A1')}
              >
                A1 課程 IGP
              </button>
              <button 
                className={`px-4 py-2 rounded-md font-bold transition-all ${activeCourseId === 'A2' ? 'bg-white shadow text-fuchsia-700' : 'text-gray-500 hover:text-gray-700'}`}
                onClick={() => setActiveCourseId('A2')}
              >
                A2 課程 IGP
              </button>
            </div>
          )}

          <button onClick={() => exportIgpToWord(state, activeCourseId)} className="btn-secondary flex items-center gap-2 text-fuchsia-700 border-fuchsia-200 hover:border-fuchsia-400 font-medium">
            <FileText size={18} /> 一鍵匯出 Word 檔
          </button>

          <button 
            onClick={generateIgpWithAI} 
            disabled={isGenerating}
            className="btn-primary"
            style={{ background: 'linear-gradient(135deg, #d946ef, #9333ea)' }}
          >
            <div className="flex items-center gap-2 font-bold shadow-lg">
              {isGenerating ? <RefreshCw className="animate-spin" size={20} /> : <Wand2 size={20} />}
              {isGenerating ? 'AI 調適中...' : 'AI 自動調整課程'}
            </div>
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 bg-red-50 text-red-700 rounded-xl border border-red-200 flex items-center gap-3 animate-fade-in">
          <AlertCircle />
          {errorMsg}
        </div>
      )}

      <div className="glass p-6 rounded-2xl border-l-4 border-l-fuchsia-500">
        <h2 className="text-xl font-bold mb-4">1. 自動匯入課程學習表現 ({activeIgp.adjustments.length} 項)</h2>
        <div className="flex flex-wrap gap-2 mb-4">
          {activeIgp.adjustments.length === 0 ? (
            <div className="text-gray-400 italic">尚無指標，請先在課程規劃中生成或挑選。</div>
          ) : (
            activeIgp.adjustments.map(adj => (
              <span key={adj.indicatorCode} className="px-2 py-1 bg-gray-100 border border-gray-200 text-sm rounded-md text-gray-700">
                {adj.indicatorCode}
              </span>
            ))
          )}
        </div>

        <div className="form-group mt-6">
          <label className="text-lg font-bold text-gray-800 flex items-center gap-2">
            2. 學生狀態與調整需求
            <span className="text-sm font-normal text-fuchsia-600 bg-fuchsia-50 px-2 py-0.5 rounded">Required</span>
          </label>
          <textarea 
            rows={3} 
            placeholder="請描述學生的學習特質或困難，AI 將根據描述從上方清單挑選最合適的 3-6 項指標進行改寫，並設計這學期的 IGP 調整策略... (例如：該生對於文字閱讀較慢，但視覺觀察力極強)" 
            value={activeIgp.studentStatus}
            onChange={(e) => handleStatusChange(e.target.value)}
            className="text-lg"
          />
        </div>
      </div>

      {activeIgp.adjustments.length > 0 && (
        <div className="space-y-6 animate-fade-in mt-8">
          
          <div className="glass p-6 rounded-2xl relative overflow-hidden group hover:shadow-xl transition-shadow">
            <div className="absolute top-0 left-0 w-2 h-full bg-fuchsia-400"></div>
            <h2 className="text-2xl font-bold mb-6 text-gray-800 flex items-center gap-2">
              <span className="bg-fuchsia-100 text-fuchsia-700 px-3 py-1 rounded-lg text-lg">ALL</span>
              課程所有學習表現指標彙整
            </h2>
            
            <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
              {activeIgp.adjustments.map((adj, index) => (
                <div key={index} className="bg-white/70 p-4 rounded-xl border border-gray-100 relative">
                  <div className="inline-block bg-fuchsia-100 text-fuchsia-800 font-bold px-3 py-1 rounded-lg mb-3">
                    {adj.indicatorCode}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <div className="text-xs text-gray-500 mb-1 font-bold">【原始指標】</div>
                      <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg border border-gray-100 h-full">{adj.originalDesc}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 mb-1 font-bold">【改寫後指標】</div>
                      <div className="text-base font-medium text-gray-800 bg-emerald-50/50 p-3 rounded-lg border border-emerald-100 h-full leading-relaxed" dangerouslySetInnerHTML={renderAdjustedHtml(adj.adjustedDesc)} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="glass p-8 rounded-2xl border-2 border-indigo-100 bg-white">
            <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2 border-b border-indigo-100 pb-4">
              ✨ 整門課程之綜合調整策略勾選
            </h2>
            
            <div className="grid grid-cols-1 gap-5">
              {[
                { id: 'globalContentStrategy', title: '內容', color: 'text-blue-600', opts: ['重組', '加深', '加廣', '濃縮', '加速', '跨領域/科目統整教學主題', '其他:'] },
                { id: 'globalProcessStrategy', title: '歷程', color: 'text-emerald-600', opts: ['高層次思考', '開放式問題', '發現式學習', '推理的證據', '選擇的自由', '團體式的互動', '彈性的教學進度', '多樣性的歷程', '其他：'] },
                { id: 'globalEnvironmentStrategy', title: '環境', color: 'text-amber-600', opts: ['調整物理的學習環境', '營造社會-情緒的學習環境', '規劃有回應的學習環境', '有挑戰性的學習環境', '調查與運用社區資源', '其他'] },
                { id: 'globalAssessmentStrategy', title: '評量', color: 'text-rose-600', opts: ['發展合適的評量工具', '訂定區分性的評量標準', '呈現多元的實作與作品', '其他：'] }
              ].map(sec => (
                <div key={sec.title} className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-4 bg-gray-50/50 p-3 rounded-xl border border-gray-100">
                  <div className={`font-bold text-base ${sec.color} sm:w-16 pt-0.5 flex-shrink-0`}>{sec.title}調整</div>
                  <div className="flex flex-wrap gap-x-6 gap-y-3">
                    {sec.opts.map(opt => (
                      <label 
                        key={opt} 
                        className="inline-flex items-start gap-1.5 text-sm cursor-pointer hover:text-indigo-600 whitespace-nowrap"
                      >
                        <input 
                          type="checkbox"
                          className="flex-shrink-0 w-4 h-4 mt-0.5 rounded text-indigo-500 cursor-pointer"
                          checked={((activeIgp as any)[sec.id] || []).includes(opt)}
                          onChange={() => handleGlobalStrategyToggle(sec.id as any, opt)}
                        />
                        {opt}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
