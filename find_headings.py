import docx

def find_headings():
    doc = docx.Document("PSM Report.docx")
    for i, para in enumerate(doc.paragraphs):
        text = para.text.strip()
        if not text: continue
        
        # Print anything that looks like a chapter or is a heading
        if "CHAPTER" in text.upper() or "Heading" in para.style.name:
            print(f"Para {i}: style='{para.style.name}', text='{text}'")

if __name__ == "__main__":
    find_headings()
