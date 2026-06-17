import docx
import re

def debug():
    doc = docx.Document("PSM Report.docx")
    chapter = 0
    
    for para in doc.paragraphs:
        text = para.text.strip()
        if not text: continue
        
        if "CHAPTER 1" in text.upper(): chapter = 1
        elif "CHAPTER 2" in text.upper(): chapter = 2
        elif "CHAPTER 3" in text.upper(): chapter = 3
        elif "CHAPTER 4" in text.upper(): chapter = 4
        elif "CHAPTER 5" in text.upper(): chapter = 5
        elif "CHAPTER 6" in text.upper(): chapter = 6
        elif "CHAPTER 7" in text.upper(): chapter = 7
            
        if "System Architecture" in text:
            print(f"Found '{text}' -> current chapter is {chapter}, style is {para.style.name}")

if __name__ == "__main__":
    debug()
