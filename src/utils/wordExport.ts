import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import { saveAs } from 'file-saver';
import { AppState, WeeklyPlan, IgpPlan, assessmentOptions, officialIssues } from '../types';
import allKnownIndicators from '../data/learning_performances.json';
import coreCompetenciesData from '../data/core_competencies.json';

/**
 * 下載並讀取 Word 模板檔案（自動使用 Vite base URL，相容 dev 與 GH Pages）
 */
async function getTemplateFile(filename: string): Promise<ArrayBuffer> {
  const url = `${import.meta.env.BASE_URL}${filename}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`無法載入模板檔案: ${url}`);
  }
  return await response.arrayBuffer();
}

/**
 * 將文字包含 [+文字+] (新增紅字) 與 [-文字-] (刪除紅字刪除線) 轉換為資料陣列
 */
function formatRichText(text: string): { text: string; isAdd?: boolean; isDel?: boolean }[] {
  if (!text) return [];
  
  const regex = /(\[\+[^\]]+\+\]|\[\-[^\]]+\-\])/g;
  const parts = text.split(regex);
  const result: { text: string; isAdd?: boolean; isDel?: boolean }[] = [];
  
  parts.forEach(part => {
    if (part.startsWith('[+') && part.endsWith('+]')) {
      result.push({ text: part.slice(2, -2), isAdd: true });
    } else if (part.startsWith('[-') && part.endsWith('-]')) {
      result.push({ text: part.slice(2, -2), isDel: true });
    } else if (part) {
      result.push({ text: part });
    }
  });
  
  return result;
}

/**
 * 匯出課程規劃為 Word
 */
export async function exportCurriculumToWord(state: AppState, courseId: 'A1' | 'A2') {
  try {
    const content = await getTemplateFile('/curriculum_template.docx');
    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
    });

    const settings = state.settings;
    const isTwoCourses = settings.isTwoCourses;
    const a1Settings = settings.courses.find(c => c.id === 'A1');
    const a2Settings = settings.courses.find(c => c.id === 'A2');

    // 合併两門課的週次，或單門課即用 lessonsA1
    const activeLessons = isTwoCourses
      ? [...state.lessonsA1, ...state.lessonsA2].sort((a, b) => a.weekNumber - b.weekNumber)
      : state.lessonsA1;

    const zhNumbers = ['零','一','二','三','四','五','六','七','八','九','十','十一','十二','十三','十四','十五','十六','十七','十八','十九','二十','二十一','二十二','二十三','二十四','二十五'];

    // 將週次資料整理成 docxtemplater 接受的陣列格式
    const formattedWeeks = activeLessons.map(lesson => {
      const splitWeek = settings.splitWeek ?? 10;
      const wCourseId = (isTwoCourses && lesson.weekNumber > splitWeek) ? 'A2' : 'A1';
      const wCourseSettings = settings.courses.find(c => c.id === wCourseId);

      // 格式：代碼-內容；有微調則「代碼m-(微調後)內容」
      let parsedIndicators = '';
      if (lesson.learningPerformances.length > 0) {
        parsedIndicators = lesson.learningPerformances.map(code => {
          const adj = lesson.performanceAdjustments[code];
          const originalObj = (allKnownIndicators as any[]).find((d:any) => d.code === code);
          const originalContent = originalObj ? originalObj.content : '';
          if (adj?.adjusted) {
            return `${code}m-${adj.adjustedDesc}`;
          }
          return `${code}-${originalContent}`;
        }).join('\n');
      }

      const issuesStr = lesson.issues.length > 0 ? lesson.issues.join('、') : '無';
      // 週次格式：統一只顯示週次與日期
      const weekLabel = `第${zhNumbers[lesson.weekNumber] || lesson.weekNumber}週\n(${lesson.dateRange})`;

      return {
        Week: weekLabel,
        LessonFocus: lesson.lessonFocus,
        IndRuns: formatRichText(parsedIndicators),
        Assessment: assessmentOptions.map(opt => lesson.assessmentMethods.includes(opt) ? `◼︎${opt}` : `□${opt}`).join('  '),
        Issues: issuesStr,
        Notes: lesson.notes
      };
    });

    // 建立領域字串
    const buildDomainStr = (cs: any) => {
      if (!cs) return '';
      const modeStr = (m: string) => cs.mode === m ? '◼︎' : '□';
      return `${modeStr('A')}單一領域/科目：${cs.mode==='A'?cs.selectedDomains.join(', '):'  '}  ${modeStr('B')}同領域跨科：${cs.mode==='B'?cs.selectedDomains.join(', '):'  '}  ${modeStr('C')}不同領域跨科：${cs.mode==='C'?cs.selectedDomains.join(', '):'  '}  ${modeStr('D')}特需融入學科：${cs.mode==='D'?cs.selectedDomains.join(', '):'  '}`;
    };

    let domainStr = '';
    let combinedCourseName = '';
    let combinedCoreComp = '';

    if (isTwoCourses && a2Settings) {
      // 雙課程：將兩門課的領域、名稱、核心素養合併輸出
      domainStr = `A1: ${buildDomainStr(a1Settings)}\nA2: ${buildDomainStr(a2Settings)}`;
      const a1Name = a1Settings?.customName || a1Settings?.name || 'A1';
      const a2Name = a2Settings?.customName || a2Settings?.name || 'A2';
      combinedCourseName = `A1 ${a1Name}\u3001A2 ${a2Name}`;
      const allCodes = [
        ...(a1Settings?.selectedCoreCompetencies || []),
        ...(a2Settings?.selectedCoreCompetencies || [])
      ];
      combinedCoreComp = [...new Set(allCodes)].map(code => {
        const comp = (coreCompetenciesData as any[]).find((c:any) => c.code === code);
        return comp ? `${comp.code} ${comp.content}` : code;
      }).join('\n');
    } else {
      // 單門課
      domainStr = buildDomainStr(a1Settings);
      combinedCourseName = a1Settings?.customName || a1Settings?.name || '';
      const selectedCodes = a1Settings?.selectedCoreCompetencies || [];
      combinedCoreComp = selectedCodes.map(code => {
        const comp = (coreCompetenciesData as any[]).find((c:any) => c.code === code);
        return comp ? `${comp.code} ${comp.content}` : code;
      }).join('\n');
    }

    // 將週次資料整理成編號過的扁平物件，以對應靜態範本中的格子
    const flattenedData: Record<string, any> = {};
    for (let i = 0; i < 21; i++) {
        const lesson = activeLessons[i];
        if (lesson) {
            const splitWeek = settings.splitWeek ?? 10;
            const wCourseId = (isTwoCourses && lesson.weekNumber > splitWeek) ? 'A2' : 'A1';
            
            let parsedIndicators = '';
            if (lesson.learningPerformances.length > 0) {
              parsedIndicators = lesson.learningPerformances.map(code => {
                const adj = lesson.performanceAdjustments[code];
                const originalObj = (allKnownIndicators as any[]).find((d:any) => d.code === code);
                const originalContent = originalObj ? originalObj.content : '';
                if (adj?.adjusted) {
                  return `${code}m-${adj.adjustedDesc}`;
                }
                return `${code}-${originalContent}`;
              }).join('\n');
            }

            const issuesStr = lesson.issues.length > 0 ? lesson.issues.join('、') : '無';
            const weekLabel = `第${zhNumbers[lesson.weekNumber] || lesson.weekNumber}週\n(${lesson.dateRange})`;

            flattenedData[`Week${i}_WeekLabel`] = weekLabel;
            flattenedData[`Week${i}_LessonFocus`] = lesson.lessonFocus;
            flattenedData[`Week${i}_IndRuns`] = formatRichText(parsedIndicators);
            flattenedData[`Week${i}_Assessment`] = assessmentOptions.map(opt => lesson.assessmentMethods.includes(opt) ? `◼︎${opt}` : `□${opt}`).join('  ');
            flattenedData[`Week${i}_Issues`] = issuesStr;
            flattenedData[`Week${i}_Notes`] = lesson.notes;
        } else {
            // 補齊空的週次格式
            flattenedData[`Week${i}_WeekLabel`] = '';
            flattenedData[`Week${i}_LessonFocus`] = '';
            flattenedData[`Week${i}_IndRuns`] = [];
            flattenedData[`Week${i}_Assessment`] = assessmentOptions.map(() => `□`).join('  ');
            flattenedData[`Week${i}_Issues`] = '';
            flattenedData[`Week${i}_Notes`] = '';
        }
    }

    // 填入所有的變數
    doc.render({
      AcademicYear: settings.academicYear,
      Grade: settings.grade,
      Semester: settings.semester,
      Teacher: settings.teacher,
      MaterialSource: settings.materialSource,
      WeeklyPeriods: String(settings.weeklyPeriods ?? 2),
      CourseName: combinedCourseName,
      DomainModeString: domainStr,
      CoreCompetencies: combinedCoreComp,
      isFirstSemester: settings.semester === '1',
      isSecondSemester: settings.semester === '2',
      CourseDescription: a1Settings?.description || '',
      ...flattenedData
    });

    const out = doc.getZip().generate({
      type: 'blob',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });

    const courseSuffix = isTwoCourses ? 'A1-A2' : (a1Settings?.name || '');
    saveAs(out, `資優課程計畫_${settings.academicYear}_${courseSuffix}.docx`);
  } catch (error: any) {
    console.error('Word 匯出失敗 (curriculum):', error);
    // 顯示 docxtemplater 詳細錯誤
    if (error?.properties?.errors) {
      console.error('Docxtemplater errors:', JSON.stringify(error.properties.errors, null, 2));
    }
    const msg = error?.properties?.errors?.map((e: any) => e.message || JSON.stringify(e)).join('; ') || error?.message || '未知錯誤';
    alert(`匯出 Word 失敗：${msg}`);
  }
}

/**
 * 匯出 IGP 改寫結果為 Word
 */
export async function exportIgpToWord(state: AppState, courseId: 'A1' | 'A2') {
  try {
    const content = await getTemplateFile('/igp_template.docx');
    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
    });

    const settings = state.settings;
    const courseSettings = settings.courses.find(c => c.id === courseId);
    const activeIgp = courseId === 'A1' ? state.igpA1 : state.igpA2;
    const activeLessons = courseId === 'A1' ? state.lessonsA1 : state.lessonsA2;

    if (!activeIgp) {
      alert('尚無 IGP 資料可匯出');
      return;
    }

    // 取得這門課裡面「所有」被選進來的指標代碼
    const deduplicatedCodes = Array.from(new Set(
      activeLessons.flatMap(lesson => lesson.learningPerformances)
    ));

    const cStrats = ['重組', '加深', '加廣', '濃縮', '加速', '跨領域/科目統整教學主題', '其他:'];
    const pStrats = ['高層次思考', '開放式問題', '發現式學習', '推理的證據', '選擇的自由', '團體式的互動', '彈性的教學進度', '多樣性的歷程', '其他：'];
    const eStrats = ['調整物理的學習環境', '營造社會-情緒的學習環境', '規劃有回應的學習環境', '有挑戰性的學習環境', '調查與運用社區資源', '其他'];
    const aStrats = ['發展合適的評量工具', '訂定區分性的評量標準', '呈現多元的實作與作品', '其他：'];

    const allIndicatorsText = deduplicatedCodes.map((code) => {
      const originalObj = (allKnownIndicators as any[]).find((d:any) => d.code === code);
      const originalContent = originalObj ? originalObj.content : '';
      const adj = activeIgp.adjustments.find(a => a.indicatorCode === code);

      if (adj && adj.adjustedDesc) {
        // 有微調：直接傳入內容，保留調整標記供轉換器處理
        return `${code}m-${adj.adjustedDesc}`;
      } else {
        // 無微調：顯示「代碼-原始內容」
        return `${code}-${originalContent}`;
      }
    }).join('\n');

    const globalStrategiesStr = 
      `學習內容調整策略：\n${cStrats.map(s => (activeIgp.globalContentStrategy || []).includes(s) ? `◼︎${s}` : `□${s}`).join('  ')}\n\n` +
      `學習歷程調整策略：\n${pStrats.map(s => (activeIgp.globalProcessStrategy || []).includes(s) ? `◼︎${s}` : `□${s}`).join('  ')}\n\n` +
      `學習環境調整策略：\n${eStrats.map(s => (activeIgp.globalEnvironmentStrategy || []).includes(s) ? `◼︎${s}` : `□${s}`).join('  ')}\n\n` +
      `學習評量調整策略：\n${aStrats.map(s => (activeIgp.globalAssessmentStrategy || []).includes(s) ? `◼︎${s}` : `□${s}`).join('  ')}`;

    doc.render({
      CourseType: courseSettings?.courseType || '必修',
      Teacher: settings.teacher || '',
      CourseName: courseSettings?.customName || courseSettings?.name || '',
      IndRuns: formatRichText(allIndicatorsText),
      GlobalStrategies: globalStrategiesStr
    });

    const out = doc.getZip().generate({
      type: 'blob',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });

    saveAs(out, `資優IGP個別調整_${settings.academicYear}_${courseSettings?.name}.docx`);
  } catch (error) {
    console.error('Word 匯出失敗', error);
    alert('匯出 Word 失敗：請確認模板檔案是否正確。');
  }
}
