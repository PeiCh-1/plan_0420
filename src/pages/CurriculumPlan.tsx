import React, { useState, useEffect } from 'react';
import { useAppContext } from '../store/AppContext';
import { WeeklyPlan, assessmentOptions, officialIssues } from '../types';
import { Calendar, Wand2, Download, Save, AlertCircle, RefreshCw, FileText } from 'lucide-react';
import learningPerformancesData from '../data/learning_performances.json';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { exportCurriculumToWord } from '../utils/wordExport';

export default function CurriculumPlan() {
  const { state, setLessonsA1, setLessonsA2, setSettings } = useAppContext();
  const { settings, apiKey, lessonsA1, lessonsA2 } = state;
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const isTwoCourses = settings.isTwoCourses;
  const splitWeek = settings.splitWeek ?? 10;
  const totalWeeks = settings.semester === '1' ? 21 : 20;

  // 合併所有週次（排序），瀏覽統一列表
  const allLessons: WeeklyPlan[] = isTwoCourses
    ? [...lessonsA1, ...lessonsA2].sort((a, b) => a.weekNumber - b.weekNumber)
    : lessonsA1;

  // 根據週次判斷屬於哪門課
  const getCourseId = (weekNumber: number): 'A1' | 'A2' => {
    if (!isTwoCourses) return 'A1';
    return weekNumber <= splitWeek ? 'A1' : 'A2';
  };

  const getCourseSettings = (weekNumber: number) => {
    const cId = getCourseId(weekNumber);
    return settings.courses.find(c => c.id === cId);
  };

  // 根據年級取得允許的學習階段
  const gradeStr = settings.grade;
  let allowedStages: string[] = [];
  if (['一', '二'].includes(gradeStr)) allowedStages = ['I'];
  else if (['三', '四'].includes(gradeStr)) allowedStages = ['II', 'III'];
  else if (['五', '六'].includes(gradeStr)) allowedStages = ['III', 'IV'];

  // 依課程取得可用指標
  const getApplicableIndicators = (courseId: 'A1' | 'A2') => {
    const cs = settings.courses.find(c => c.id === courseId);
    return learningPerformancesData.filter((ind: any) =>
      cs?.selectedDomains.includes(ind.domainName) &&
      (allowedStages.length === 0 || allowedStages.includes(ind.stage))
    );
  };

  // 初始化週次（依單課/雙課分別建立）
  useEffect(() => {
    const makeLesson = (i: number, startDate: Date, courseId?: 'A1' | 'A2'): WeeklyPlan => {
      const start = new Date(startDate);
      start.setDate(start.getDate() + (i - 1) * 7);
      const end = new Date(start);
      end.setDate(end.getDate() + 4);
      const fmt = (d: Date) => `${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getDate().toString().padStart(2,'0')}`;
      return {
        weekNumber: i,
        dateRange: `${fmt(start)} ~ ${fmt(end)}`,
        courseId,
        learningPerformances: [],
        performanceAdjustments: {},
        lessonFocus: '',
        assessmentMethods: [],
        issues: [],
        notes: ''
      };
    };

    const baseDate = new Date(settings.startDate || new Date());

    if (!isTwoCourses) {
      // 單門課：A1 應涵蓋所有 totalWeeks 週
      // 若已有正確數量且첫週為第1週，則不重置
      if (lessonsA1.length === totalWeeks && lessonsA1[0]?.weekNumber === 1 && !lessonsA1[0]?.courseId?.startsWith('A2')) {
        return;
      }
      const lessons: WeeklyPlan[] = [];
      for (let i = 1; i <= totalWeeks; i++) lessons.push(makeLesson(i, baseDate, 'A1'));
      setLessonsA1(lessons);
      setLessonsA2([]);
    } else {
      // 雙門課：A1 = 第 1～splitWeek 週，A2 = 第 splitWeek+1～totalWeeks 週
      const expectedA1Count = splitWeek;
      const expectedA2Count = totalWeeks - splitWeek;

      // 驗證現有資料是否已符合此分割設定
      const a1Valid = lessonsA1.length === expectedA1Count &&
        lessonsA1[0]?.weekNumber === 1 &&
        lessonsA1[lessonsA1.length - 1]?.weekNumber === splitWeek;
      const a2Valid = lessonsA2.length === expectedA2Count &&
        lessonsA2[0]?.weekNumber === splitWeek + 1 &&
        lessonsA2[lessonsA2.length - 1]?.weekNumber === totalWeeks;

      if (a1Valid && a2Valid) return; // 資料已正確，無需重置

      // 重新初始化
      const a1: WeeklyPlan[] = [];
      const a2: WeeklyPlan[] = [];
      for (let i = 1; i <= splitWeek; i++) a1.push(makeLesson(i, baseDate, 'A1'));
      for (let i = splitWeek + 1; i <= totalWeeks; i++) a2.push(makeLesson(i, baseDate, 'A2'));
      setLessonsA1(a1);
      setLessonsA2(a2);
    }
  }, [settings.startDate, settings.semester, settings.isTwoCourses, settings.splitWeek]);


  // 更新某週的資料
  const handleLessonUpdate = (weekNumber: number, updates: Partial<WeeklyPlan>) => {
    const courseId = getCourseId(weekNumber);
    if (courseId === 'A1') {
      const updated = lessonsA1.map(l => l.weekNumber === weekNumber ? { ...l, ...updates } : l);
      setLessonsA1(updated);
    } else {
      const updated = lessonsA2.map(l => l.weekNumber === weekNumber ? { ...l, ...updates } : l);
      setLessonsA2(updated);
    }
  };

  const handleCheckboxToggle = (weekNumber: number, field: 'assessmentMethods'|'issues', value: string) => {
    const lesson = allLessons.find(l => l.weekNumber === weekNumber);
    if (!lesson) return;
    let arr = [...lesson[field]];
    if (arr.includes(value)) arr = arr.filter(v => v !== value);
    else arr.push(value);
    handleLessonUpdate(weekNumber, { [field]: arr });
  };

  const generateWithAI = async () => {
    if (!apiKey) { setErrorMsg('請先至基本設定填寫 Gemini API 密鑰！'); return; }
    const a1Settings = settings.courses.find(c => c.id === 'A1');
    if (!a1Settings?.name) { setErrorMsg('請先完成課程基本設定與領域選擇！'); return; }

    setIsGenerating(true);
    setErrorMsg('');

    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

      // 建立指標、議題、評量選項等參考文字
      const buildIndicatorText = (courseId: 'A1' | 'A2') =>
        getApplicableIndicators(courseId).map((ind: any) => `[${ind.code}] ${ind.content}`).join('\n');

      const a2Settings = settings.courses.find(c => c.id === 'A2');

      let courseSection = '';
      if (isTwoCourses && a2Settings) {
        courseSection = `
【A1 課程】（第 1～${splitWeek} 週）
領域/科目：${a1Settings.name}
課程描述：${a1Settings.description || '無'}
學習表現指標庫（A1）：
${buildIndicatorText('A1')}

【A2 課程】（第 ${splitWeek + 1}～${totalWeeks} 週）
領域/科目：${a2Settings.name}
課程描述：${a2Settings.description || '無'}
學習表現指標庫（A2）：
${buildIndicatorText('A2')}
`;
      } else {
        courseSection = `
領域/科目：${a1Settings.name}
課程描述：${a1Settings.description || '無'}
學習表現指標庫：
${buildIndicatorText('A1')}
`;
      }

      const prompt = `您是一位高雄市專業的資優教育教師與課程設計專家，請為我規劃一整學期的教學進度與課程總目標。
【課程設定】
學期週數：${totalWeeks} 週
對象年級：${settings.grade}年級
${courseSection}

【行政選項參考 (選填)】
可選評量方式：'口語評量','實作評量','紙筆測驗','檔案評量','觀察評量','動態評量','自我評量','同儕評量'
可選融入議題：'性別平等教育','人權教育','環境教育','海洋教育','品德教育','生命教育','法治教育','科技教育','資訊教育','安全教育','防災教育','原住民族教育','多元文化教育','閱讀素養教育','家庭教育','生涯規劃教育','能源教育','媒體素養教育','戶外教育'

【任務要求】
1. 生成「課程總體學習目標」：需涵蓋認知、情意、技能三大面向，匯整為列點顯示，禁止標註面向名稱。
2. 規劃每週進度：
   - 每週挑選 1~2 個最切合的指標代碼。
   - 【資優調整規範】：**全學期僅針對最核心、必要更改的 3~5 個學習表現指標進行調整標註即可**，不需每週調整。
   - 【標記語法規範】：必須以原始指標內容為底稿。**標記語法必須精確為 [+內容+] 或 [-內容-] ，中間嚴禁出現任何額外空格或如 [- +] 之類的錯誤符號。** 標註內容必須純淨，可直接提交審核。
   - **單元重點字數限制**：單元重點 (lessonFocus) 只能根據課程內容生成 **10 個字以內** 的重點。
   - **同步勾選行政欄位**：請根據每週教學重點，自動挑選最適合的「評量方式」以及必要融入的「議題」。

【JSON 格式要求】
請回傳如下結構的物件（不加 Markdown code block）：
{
  "courseGoalsA1": "...",
  "courseGoalsA2": "...", 
  "weeks": [
    {
      "weekNumber": 1,
      "courseId": "A1",
      "indicators": [{ "code": "...", "adjusted": true, "adjustedDesc": "指標內容[+新增內容+][-原內容-]" }],
      "lessonFocus": "10字內重點",
      "assessmentMethods": ["口語評量", "觀察評量"],
      "issues": ["人權教育"]
    },
    ...累計共 ${totalWeeks} 週
  ]
}`;

      const result = await model.generateContent(prompt);
      let responseText = result.response.text().trim();
      if (responseText.startsWith('```json')) {
        responseText = responseText.replace(/^```json/, '').replace(/```$/, '').trim();
      }
      if (responseText.startsWith('```')) {
        responseText = responseText.replace(/^```/, '').replace(/```$/, '').trim();
      }

      const generatedData = JSON.parse(responseText);
      const generatedWeeks = generatedData.weeks || [];

      const mergeInto = (lessons: WeeklyPlan[], courseId: 'A1' | 'A2') =>
        lessons.map(lesson => {
          const genW = generatedWeeks.find((g: any) => g.weekNumber === lesson.weekNumber);
          if (!genW) return lesson;
          const perfs: string[] = [];
          const adjs: Record<string, any> = {};
          genW.indicators?.forEach((ind: any) => {
            perfs.push(ind.code);
            if (ind.adjusted) adjs[ind.code] = { adjusted: true, adjustedDesc: ind.adjustedDesc };
          });
          return { ...lesson, courseId, learningPerformances: perfs, performanceAdjustments: adjs, lessonFocus: genW.lessonFocus || '', assessmentMethods: genW.assessmentMethods || [], issues: genW.issues || [] };
        });

      setLessonsA1(mergeInto(lessonsA1, 'A1'));
      if (isTwoCourses) setLessonsA2(mergeInto(lessonsA2, 'A2'));

      // 更新課程目標
      const updatedCourses = [...settings.courses];
      let hasChanges = false;
      if (generatedData.courseGoalsA1) {
        const idx = updatedCourses.findIndex(c => c.id === 'A1');
        if (idx !== -1) { updatedCourses[idx].courseGoals = generatedData.courseGoalsA1; hasChanges = true; }
      }
      if (isTwoCourses && generatedData.courseGoalsA2) {
        const idx = updatedCourses.findIndex(c => c.id === 'A2');
        if (idx !== -1) { updatedCourses[idx].courseGoals = generatedData.courseGoalsA2; hasChanges = true; }
      }
      if (hasChanges) {
        setSettings({ ...settings, courses: updatedCourses });
      }

    } catch (err: any) {
      console.error(err);
      setErrorMsg('生成失敗，請確認 API Key 是否正確，或稍後再試。' + (err.message || ''));
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-800 tracking-tight flex items-center gap-2">
            <Calendar className="text-emerald-600" /> 課程規劃
          </h1>
          <p className="text-gray-500 mt-1">
            {isTwoCourses
              ? `A1 課程（第 1～${splitWeek} 週） | A2 課程（第 ${splitWeek+1}～${totalWeeks} 週）`
              : '一學期的教學時程規劃表。若無靈感，可讓 AI 協助生成。'
            }
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button onClick={() => exportCurriculumToWord(state, 'A1')} className="btn-secondary flex items-center gap-2 text-indigo-700 border-indigo-200 hover:border-indigo-400 font-medium">
            <FileText size={18} /> 一鍵匯出 Word 檔
          </button>
          <button 
            onClick={generateWithAI} 
            disabled={isGenerating}
            className="btn-primary flex items-center gap-2 shadow-lg hover:shadow-indigo-500/30 font-bold"
          >
            {isGenerating ? <RefreshCw className="animate-spin" size={20} /> : <Wand2 size={20} />}
            {isGenerating ? 'AI 思索中...' : 'AI 生成課程重點'}
          </button>
        </div>
      </div>

      {/* 課程目標區域 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {settings.courses.map((course, idx) => (
          <div key={course.id} className="glass p-4 rounded-xl border-l-4 border-emerald-500 bg-emerald-50/30">
            <label className="block text-sm font-bold text-emerald-800 mb-2 flex items-center gap-2">
              <FileText size={16} /> 
              {isTwoCourses ? `${course.id} 課程目標 (認知、情意、技能三大面向)` : '課程目標 (認知、情意、技能三大面向)'}
            </label>
            <textarea
              rows={4}
              className="w-full text-sm p-3 border border-emerald-100 rounded-lg focus:ring-2 focus:ring-emerald-500 bg-white"
              placeholder="AI 將自動生成列點式目標，您也可以手動修改..."
              value={course.courseGoals || ''}
              onChange={(e) => {
                const updatedCourses = [...settings.courses];
                updatedCourses[idx] = { ...course, courseGoals: e.target.value };
                setSettings({ ...settings, courses: updatedCourses });
              }}
            />
            <p className="text-[10px] text-emerald-600 mt-1 italic">* 此欄位僅供參考，不匯入 Word 檔</p>
          </div>
        ))}
      </div>

      {errorMsg && (
        <div className="p-4 bg-red-50 text-red-700 rounded-xl border border-red-200 flex items-center gap-3 animate-fade-in">
          <AlertCircle /> {errorMsg}
        </div>
      )}

      {allLessons.length === 0 ? (
        <div className="glass p-10 text-center text-gray-500 italic rounded-2xl border-dashed border-2">
          尚未產生週次，請回到基本設定完成設定或等待系統載入...
        </div>
      ) : (
        <div className="space-y-6">
          {allLessons.map((lesson) => {
            const lessonCourseId = lesson.courseId || getCourseId(lesson.weekNumber);
            const courseSettings = getCourseSettings(lesson.weekNumber);
            const indicatorsForCourse = getApplicableIndicators(lessonCourseId);
            const isA2 = lessonCourseId === 'A2';

            return (
              <div key={lesson.weekNumber} className={`glass p-6 rounded-2xl transition-colors group border-l-4 ${isA2 ? 'border-l-orange-400 hover:border-orange-300' : 'border-l-indigo-400 hover:border-indigo-300'}`}>
                <div className="flex flex-col md:flex-row gap-4">
                  {/* Week & Date Sidebar */}
                  <div className="w-full md:w-36 flex-shrink-0 flex flex-col md:border-r border-gray-200 md:pr-4 gap-1">
                    {isTwoCourses && (
                      <span className={`text-xs font-bold px-2 py-0.5 rounded w-fit ${isA2 ? 'bg-orange-100 text-orange-800' : 'bg-blue-100 text-blue-800'}`}>
                        {lessonCourseId} · {courseSettings?.customName || courseSettings?.name}
                      </span>
                    )}
                    <div className="text-xl font-bold text-indigo-700">第 {lesson.weekNumber} 週</div>
                    <div className="text-sm text-gray-500 font-mono mt-1 bg-white/50 px-2 py-1 rounded inline-block w-max">{lesson.dateRange}</div>
                  </div>

                  {/* Main Content */}
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="form-group mb-0">
                      <label className="text-xs uppercase tracking-wider text-gray-500">單元內容 / 教學重點 (10字內)</label>
                      <input 
                        type="text" 
                        value={lesson.lessonFocus}
                        onChange={(e) => handleLessonUpdate(lesson.weekNumber, { lessonFocus: e.target.value })}
                        className="text-lg font-bold text-gray-800 bg-white/70"
                        placeholder="教學主題"
                      />
                    </div>

                    <div className="form-group mb-0 row-span-2">
                      <label className="text-xs uppercase tracking-wider text-gray-500">學習表現指標與調整</label>
                      <div className="bg-white/60 p-3 rounded-lg border border-gray-200 min-h-[120px] text-sm text-gray-700">
                        {lesson.learningPerformances.length === 0 ? (
                          <span className="text-gray-400 italic">無設定指標</span>
                        ) : (
                          <div className="space-y-3">
                            {lesson.learningPerformances.map(code => {
                              const adj = lesson.performanceAdjustments[code];
                              const originalContent = learningPerformancesData.find((l:any) => l.code === code)?.content || '';
                              const displayValue = adj?.adjusted ? adj.adjustedDesc : originalContent;
                              
                              return (
                                <div key={code} className={`p-3 rounded-xl border transition-all ${adj?.adjusted ? 'border-amber-300 bg-amber-50/80 shadow-sm' : 'border-gray-100 bg-white relative'}`}>
                                  <div className="flex items-center justify-between mb-2">
                                    <span className="font-bold text-indigo-900 bg-indigo-50 px-2 py-0.5 rounded text-xs">{code}</span>
                                    <div className="flex items-center gap-2">
                                      {adj?.adjusted && (
                                        <span className="text-[10px] bg-red-500 text-white px-1.5 py-0.5 rounded shadow-sm font-black animate-pulse">m (調整)</span>
                                      )}
                                      <button 
                                        onClick={() => handleLessonUpdate(lesson.weekNumber, { learningPerformances: lesson.learningPerformances.filter(c => c !== code) })}
                                        className="text-gray-300 hover:text-red-500 transition-colors"
                                        title="移除此指標"
                                      >✕</button>
                                    </div>
                                  </div>
                                  <textarea 
                                    className="w-full text-sm border-gray-200 border rounded-lg p-2 focus:ring-2 focus:ring-amber-300 resize-y min-h-[80px] bg-white/90 shadow-inner"
                                    value={displayValue}
                                    placeholder="指標內容..."
                                    onChange={(e) => {
                                      handleLessonUpdate(lesson.weekNumber, {
                                        performanceAdjustments: {
                                          ...lesson.performanceAdjustments,
                                          [code]: { adjusted: true, adjustedDesc: e.target.value }
                                        }
                                      });
                                    }}
                                  />
                                </div>
                              );
                            })}
                          </div>
                        )}
                        <div className="mt-3">
                          <select
                            className="w-full text-xs p-1.5 border border-gray-200 rounded text-gray-600 bg-gray-50 hover:bg-white cursor-pointer"
                            value=""
                            onChange={(e) => {
                              if (e.target.value) {
                                handleLessonUpdate(lesson.weekNumber, { learningPerformances: [...lesson.learningPerformances, e.target.value] });
                              }
                            }}
                          >
                            <option value="">＋ 手動加入新指標...</option>
                            {indicatorsForCourse.filter((ind:any) => !lesson.learningPerformances.includes(ind.code)).map((ind:any) => (
                              <option key={ind.code} value={ind.code}>[{ind.code}] {ind.content.substring(0, 30)}...</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>

                    <div className="form-group mb-0">
                      <label className="text-xs uppercase tracking-wider text-gray-500">備註</label>
                      <textarea 
                        rows={2} 
                        value={lesson.notes}
                        onChange={(e) => handleLessonUpdate(lesson.weekNumber, { notes: e.target.value })}
                        className="bg-white/70 resize-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Bottom Row - Checkboxes */}
                <div className="mt-4 pt-4 border-t border-gray-100 flex flex-col md:flex-row gap-6">
                  <div className="w-full md:w-1/2">
                    <label className="text-xs uppercase tracking-wider text-gray-500 block mb-2">評量方式</label>
                    <div className="flex flex-wrap gap-x-4 gap-y-2">
                      {assessmentOptions.map(opt => (
                        <label key={opt} className="inline-flex items-start gap-1.5 text-sm cursor-pointer hover:text-indigo-600 whitespace-nowrap">
                          <input type="checkbox" checked={lesson.assessmentMethods.includes(opt)} onChange={() => handleCheckboxToggle(lesson.weekNumber, 'assessmentMethods', opt)} className="flex-shrink-0 w-4 h-4 rounded text-indigo-500 mt-0.5" />
                          {opt}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="w-full md:w-1/2">
                    <label className="text-xs uppercase tracking-wider text-gray-500 block mb-2">融入議題</label>
                    <div className="flex flex-wrap gap-x-2 gap-y-2 max-h-32 overflow-y-auto pr-2">
                      {officialIssues.map(opt => (
                        <label key={opt} className="inline-flex items-start gap-1.5 text-xs bg-gray-100/50 py-1 px-2 rounded cursor-pointer hover:bg-white border border-transparent hover:border-gray-200 whitespace-nowrap shadow-sm">
                          <input type="checkbox" checked={lesson.issues.includes(opt)} onChange={() => handleCheckboxToggle(lesson.weekNumber, 'issues', opt)} className="flex-shrink-0 w-4 h-4 rounded text-emerald-500 border-gray-300 mt-0.5" />
                          {opt}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
