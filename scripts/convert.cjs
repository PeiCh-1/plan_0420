const fs = require('fs');
const path = require('path');

function parseStage(code) {
  if (code.includes('-II-') || code.includes('-E-')) return 'II';
  if (code.includes('-III-')) return 'III';
  if (code.includes('-IV-')) return 'IV';
  return '';
}

function tsvToJson(srcPath, destPath) {
  const content = fs.readFileSync(srcPath, 'utf8');
  const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const headers = lines.shift().split('\t');
  
  const data = lines.map(line => {
    const cols = line.split('\t');
    return {
      domainCode: cols[0],
      domainName: cols[1],
      code: cols[2],
      content: cols[3],
      stage: parseStage(cols[2])
    };
  });
  
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, JSON.stringify(data, null, 2), 'utf8');
  console.log(`Converted ${path.basename(srcPath)} to JSON`);
}

tsvToJson(
  path.join(__dirname, '../data/source/資優課程計劃平台 - 學習表現指標.tsv'), 
  path.join(__dirname, '../src/data/learning_performances.json')
);

tsvToJson(
  path.join(__dirname, '../data/source/資優課程計劃平台 - 核心素養.tsv'), 
  path.join(__dirname, '../src/data/core_competencies.json')
);
