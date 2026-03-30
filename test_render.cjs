const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const fs = require('fs');
const path = require('path');

function testRender(filePath, data, label) {
  try {
    const content = fs.readFileSync(path.resolve(__dirname, filePath), 'binary');
    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
    doc.render(data);
    console.log(`✅ ${label} RENDER OK`);
  } catch (e) {
    console.error(`❌ ${label} RENDER ERROR:`, e.message);
    if (e.properties && e.properties.errors) {
      e.properties.errors.forEach(err => {
        console.error('  Detail:', JSON.stringify(err));
      });
    }
  }
}

// Simulate curriculum export
testRender('public/curriculum_template.docx', {
  AcademicYear: '113',
  Grade: '四',
  Semester: '2',
  Teacher: '測試教師',
  MaterialSource: '自編',
  WeeklyPeriods: '2',
  CourseName: 'A1 創意思考',
  DomainModeString: '◼︎單一領域：特創領域',
  CoreCompetencies: '特創-E-A1 測試素養',
  isFirstSemester: false,
  isSecondSemester: true,
  CourseDescription: '課程描述',
  Weeks: [
    {
      Week: '第一週\n(03/30~04/03)',
      Indicators: '特創 1a-II-1-在觀察事物後提出問題',
      LessonFocus: '創意啟蒙',
      Assessment: '◼︎口語評量  □實作評量',
      Issues: '無',
      Notes: ''
    }
  ]
}, 'curriculum_template.docx');

// Simulate IGP export
testRender('public/igp_template.docx', {
  CourseType: '必修',
  Teacher: '測試教師',
  CourseName: 'A1 創意思考',
  AllIndicators: '特創 1a-II-1-在觀察事物後提出問題',
  GlobalStrategies: '學習內容調整策略：□重組 ◼︎加深'
}, 'igp_template.docx');
