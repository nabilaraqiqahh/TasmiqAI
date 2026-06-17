import docx

def inspect():
    doc = docx.Document("PSM Report.docx")
    for i, para in enumerate(doc.paragraphs):
        text = para.text.strip()
        if not text: continue
        if "Conclusion" in text or "Introduction" in text or "Test Plan" in text or "System Architecture" in text:
            print(f"Para {i}: '{text}'")
            if para._p.pPr and para._p.pPr.numPr:
                print(f"  Has list numPr: {para._p.pPr.numPr.xml}")

if __name__ == "__main__":
    inspect()
