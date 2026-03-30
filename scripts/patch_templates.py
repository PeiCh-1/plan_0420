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
        if '填表教師：' in p.text and '{Teacher}' not in p.text:
             p.add_run('{Teacher}')

    # 3. 樣式注入 (學習表現欄位)
    for t in doc.tables:
        if len(t.rows) >= 6:
            row5 = t.rows[5]
            cell = row5.cells[1]
            # 判斷是否已經注入過
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
    print(f"Patched Curriculum Template (with Semester & RichText): {path}")

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
