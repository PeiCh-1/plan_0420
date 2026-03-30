from docx import Document
import os

def patch_curriculum(path):
    doc = Document(path)
    
    # 檢查是否已經被處理過（等冪性 check）
    for p in doc.paragraphs:
        if "{#isFirstSemester}" in p.text:
            print(f"Skipping paragraph patching for {path} as it's already patched.")
            break
    else:
        # Paragraphs replacement for Semester boundaries
        has_found_semester_1 = False
        for p in doc.paragraphs:
            if "第一學期特殊教育" in p.text:
                p.text = "{#isFirstSemester}\n" + p.text.strip()
                has_found_semester_1 = True
            elif "第二學期特殊教育" in p.text:
                if has_found_semester_1:
                    p.insert_paragraph_before("{/isFirstSemester}")
                p.text = "{#isSecondSemester}\n" + p.text.strip()
        
        doc.add_paragraph("{/isSecondSemester}")


    # Tables replacement
    for t in doc.tables:
        if len(t.rows) > 5:
            # Safely locate headers and inject tags into the next empty cell
            for row in t.rows[:5]:
                for i, c in enumerate(row.cells):
                    text = c.text.strip()
                    if "單一領域" in text and "同領域跨科" in text:
                        # Found the domain checkbox cell! Replace it entirely with our dynamic string tag.
                        # It is merged, so just put it here
                        c.text = "{DomainModeString}"
                    elif "課程名稱" in text and i+1 < len(row.cells) and not row.cells[i+1].text.strip():
                        # Fill all subsequent empty merged cells with the tag to prevent split display
                        for j in range(i+1, len(row.cells)):
                            if not row.cells[j].text.strip(): row.cells[j].text = "{CourseName}"
                            else: break
                    elif "教材來源" in text and i+1 < len(row.cells) and not row.cells[i+1].text.strip():
                        row.cells[i+1].text = "{MaterialSource}"
                    elif ("教學者" in text or "設計者" in text) and i+1 < len(row.cells) and not row.cells[i+1].text.strip():
                        row.cells[i+1].text = "{Teacher}"
                    elif "年級" in text and i+1 < len(row.cells) and not row.cells[i+1].text.strip():
                        row.cells[i+1].text = "{Grade}"
                    elif "節數" in text and i+1 < len(row.cells):
                        # 只填左側緊鄰的 3 格（索引 i+1 到 i+3），避免蓋過右側教學者欄
                        for j in range(i+1, min(i+4, len(row.cells))):
                            row.cells[j].text = "{WeeklyPeriods}"
                        # 不 break，繼續掃描讓「設計者/教學者」條件也能執行
                    elif "領綱核心素養" in text and i+1 < len(row.cells):
                        # Fill all remaining cells in this row with CoreCompetencies
                        for j in range(i+1, len(row.cells)):
                            row.cells[j].text = "{CoreCompetencies}"
                        break
            
            # Setup row 5 as the docxtemplater loop row
            row5 = t.rows[5]
            row5.cells[0].text = "{#Weeks}{Week}"
            row5.cells[1].text = "{@Indicators}"
            row5.cells[2].text = "{LessonFocus}"
            row5.cells[3].text = "{Assessment}"
            # DO NOT blank cell 4, it is merged with cell 3!
            row5.cells[5].text = "{Issues}"
            # DO NOT blank cell 6
            row5.cells[7].text = "{Notes}{/Weeks}"
            
            # Delete rows 6 through end
            for i in range(len(t.rows)-1, 5, -1):
                tr = t.rows[i]._tr
                tr.getparent().remove(tr)

    # 插入備註文字段落 (表格後)
    notes_parts = [
        "1.本學年實際上課日數及補休補班調整，仍依教育局公告之本學年度重要行事曆辦理。",
        "2.融入議題參考：性別平等教育、人權教育、環境教育、海洋教育、科技教育、能源教育、家庭教育、原住民族教育、品德教育、生命教育、法治教育、資訊教育、安全教育、防災教育、生涯規劃教育、多元文化教育、閱讀素養教育、戶外教育、國際教育…等（上述議題係參考「十二年國教課綱議題融入說明手冊」所列出，各校亦可選擇適合之議題填入）。",
        "3.評量方式填寫參考：口頭評量、紙筆評量、實作評量、教師觀察、學生自評、同儕互評或其他適合之評量方式。"
    ]
    for note in notes_parts:
        p = doc.add_paragraph(note)
        p.style.font.size = 101600 # Approx 8-9 pts? or just use default

    doc.save(path)
    print(f"Patched {path}")

def patch_igp(path):
    doc = Document(path)
    
    # Table replacement
    for t in doc.tables:
        if len(t.rows) >= 2:
            # Table 0 is the single IGP table

            
            # Row 0: Course Name
            for i, c in enumerate(t.rows[0].cells):
                if "課程名稱" in c.text and i+1 < len(t.rows[0].cells):
                    t.rows[0].cells[i+1].text = "{CourseName}"
                elif "類型" in c.text and i+1 < len(t.rows[0].cells):
                    t.rows[0].cells[i+1].text = "{CourseType}"
                elif "教師" in c.text and i+1 < len(t.rows[0].cells):
                    t.rows[0].cells[i+1].text = "{Teacher}"
            
            # Setup Row 2 as the single loop row for all strategies
            row2 = t.rows[2]
            row2.cells[0].text = "1"
            
            # Merge cell 1 to 3 to hold the indicator text
            for j in range(1, 4):
                if j < len(row2.cells):
                    row2.cells[j].text = "{@AllIndicators}"
            # DO NOT blank cell 2, it is merged with cell 1!

            # Strategy column: The last cell in the row
            row2.cells[-1].text = "{GlobalStrategies}"

            # DO NOT blank cell -2, it is merged
            
            # Clear row 3, 4, 5 (Only if they exist)
            current_count = len(t.rows)
            for i in range(min(5, current_count - 1), 2, -1):
                tr = t.rows[i]._tr
                tr.getparent().remove(tr)


    doc.save(path)
    print(f"Patched {path}")

if __name__ == "__main__":
    patch_curriculum('public/curriculum_template.docx')
    patch_igp('public/igp_template.docx')
