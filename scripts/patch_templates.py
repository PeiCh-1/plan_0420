import sys
import os
from docx import Document
from docx.shared import RGBColor

def patch_curriculum(path):
    if not os.path.exists(path):
        print(f"Error: Template not found at {path}")
        return
    
    doc = Document(path)
    
    # 檢查是否已經有學期標籤 (等冪性保護)
    full_text = "".join([p.text for p in doc.paragraphs])
    
    # 1. 注入學期標題標籤
    if "{#isFirstSemester}" not in full_text:
        for p in doc.paragraphs:
            if "第一學期" in p.text and "特殊教育課程計畫" in p.text:
                p.insert_paragraph_before("{#isFirstSemester}")
                break

    if "{#isSecondSemester}" not in full_text:
        for p in doc.paragraphs:
            if "第二學期" in p.text and "特殊教育課程計畫" in p.text:
                # 在第二學期標題前插入：先結束第一學期，再開始第二學期
                p.insert_paragraph_before("{/isFirstSemester}")
                p.insert_paragraph_before("{#isSecondSemester}")
                break
    
    # 文件末端閉合第二學期
    if "{/isSecondSemester}" not in full_text:
        doc.add_paragraph("{/isSecondSemester}")

    # 2. 定標填表教師 (如果範本中有此文字)
    for p in doc.paragraphs:
        if ('填表教師：' in p.text or '設計者/教學者' in p.text) and '{Teacher}' not in p.text:
             p.add_run('{Teacher}')

    for t in doc.tables:
        for r in t.rows:
            for c in r.cells:
                if '設計者/教學者' in c.text and '{Teacher}' not in c.text:
                    c.paragraphs[0].add_run('：{Teacher}')

    # 3. 樣式注入 (學習表現與週次內容)
    # 根據 inspector 診斷：第 1 到 21 週位於 Row 5 到 Row 25
    for t in doc.tables:
        if len(t.rows) >= 25:
             for i in range(21):
                row_idx = 5 + i
                row = t.rows[row_idx]
                
                # Column 1: 學習表現 (IndRuns)
                cell_ind = row.cells[1]
                if f"{{#Week{i}_IndRuns}}" not in cell_ind.text:
                    cell_ind.text = ""
                    p = cell_ind.paragraphs[0]
                    p.add_run(f"{{#Week{i}_IndRuns}}{{#isAdd}}")
                    r_add = p.add_run("{text}")
                    r_add.font.color.rgb = RGBColor(0xFF, 0x00, 0x00)
                    p.add_run("{/isAdd}{#isDel}")
                    r_del = p.add_run("{text}")
                    r_del.font.color.rgb = RGBColor(0xFF, 0x00, 0x00)
                    r_del.font.strike = True
                    p.add_run(f"{{/isDel}}{{^isAdd}}{{^isDel}}{{text}}{{/isDel}}{{/isAdd}}{{/Week{i}_IndRuns}}")

                # Column 2: 教學重點
                cell_focus = row.cells[2]
                if f"{{Week{i}_LessonFocus}}" not in cell_focus.text:
                    cell_focus.text = f"{{Week{i}_LessonFocus}}"

                # Column 3: 評量方式
                cell_assess = row.cells[3]
                if f"{{Week{i}_Assessment}}" not in cell_assess.text:
                    cell_assess.text = f"{{Week{i}_Assessment}}"

                # Column 5: 融入議題
                cell_issues = row.cells[5]
                if f"{{Week{i}_Issues}}" not in cell_issues.text:
                    cell_issues.text = f"{{Week{i}_Issues}}"

                # Column 7: 備註
                cell_notes = row.cells[7]
                if f"{{Week{i}_Notes}}" not in cell_notes.text:
                    cell_notes.text = f"{{Week{i}_Notes}}"
            
    doc.save(path)
    print(f"Patched Curriculum Template (ALL 21 WEEKS): {path}")

def patch_igp(path):
    if not os.path.exists(path):
        return
    doc = Document(path)
    for t in doc.tables:
        if len(t.rows) >= 3:
            row2 = t.rows[2]
            cell = row2.cells[1]
            if "{#IndRuns}" not in cell.text:
                cell.text = ""
                p = cell.paragraphs[0]
                p.add_run("{#IndRuns}{#isAdd}")
                r_add = p.add_run("{text}")
                r_add.font.color.rgb = RGBColor(0xFF, 0x00, 0x00)
                p.add_run("{/isAdd}{#isDel}")
                r_del = p.add_run("{text}")
                r_del.font.color.rgb = RGBColor(0xFF, 0x00, 0x00)
                r_del.font.strike = True
                p.add_run("{/isDel}{^isAdd}{^isDel}{text}{/isDel}{/isAdd}{/IndRuns}")
    doc.save(path)
    print(f"Patched IGP Template: {path}")

if __name__ == "__main__":
    patch_curriculum('public/curriculum_template.docx')
    patch_igp('public/igp_template.docx')
