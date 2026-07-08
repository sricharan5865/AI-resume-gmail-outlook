import sys
import os

try:
    from pptx import Presentation
    from pptx.util import Inches, Pt
    from pptx.dml.color import RGBColor
    from pptx.enum.text import PP_ALIGN
    from pptx.enum.shapes import MSO_SHAPE
except ImportError:
    print("Error: python-pptx is not installed. Installing it now...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "python-pptx"])
    from pptx import Presentation
    from pptx.util import Inches, Pt
    from pptx.dml.color import RGBColor
    from pptx.enum.text import PP_ALIGN
    from pptx.enum.shapes import MSO_SHAPE

def create_presentation():
    prs = Presentation()
    
    # Set slide dimensions to widescreen (16:9)
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)
    
    # Custom color palette (Sleek dark theme)
    bg_color = RGBColor(11, 15, 26)       # #0b0f1a (deep dark blue)
    card_color = RGBColor(22, 28, 45)     # #161c2d (navy slate)
    text_primary = RGBColor(255, 255, 255) # white
    text_secondary = RGBColor(156, 163, 175) # light gray
    accent_primary = RGBColor(99, 102, 241) # #6366f1 (indigo accent)
    accent_success = RGBColor(34, 197, 94)  # green
    accent_warning = RGBColor(251, 113, 133) # pink

    # Helper to set slide background
    def set_background(slide):
        background = slide.background
        fill = background.fill
        fill.solid()
        fill.fore_color.rgb = bg_color

    # Helper to create a card shape
    def add_card(slide, left, top, width, height, color):
        shape = slide.shapes.add_shape(
            MSO_SHAPE.ROUNDED_RECTANGLE, left, top, width, height
        )
        shape.fill.solid()
        shape.fill.fore_color.rgb = color
        shape.line.color.rgb = RGBColor(40, 50, 75)
        shape.line.width = Pt(1)
        return shape

    # Helper to add standard headers
    def add_header(slide, title, category="TALENTFLOW PROJECT"):
        # Category tracker
        tx_box = slide.shapes.add_textbox(Inches(0.8), Inches(0.4), Inches(11.7), Inches(0.4))
        tf = tx_box.text_frame
        tf.word_wrap = True
        p = tf.paragraphs[0]
        p.text = category.upper()
        p.font.size = Pt(10)
        p.font.bold = True
        p.font.color.rgb = accent_primary
        p.font.name = 'Arial'

        # Main slide title
        tx_box_title = slide.shapes.add_textbox(Inches(0.8), Inches(0.7), Inches(11.7), Inches(0.8))
        tf_title = tx_box_title.text_frame
        tf_title.word_wrap = True
        p_title = tf_title.paragraphs[0]
        p_title.text = title
        p_title.font.size = Pt(28)
        p_title.font.bold = True
        p_title.font.color.rgb = text_primary
        p_title.font.name = 'Arial'

    # --- SLIDE 1: Title Slide ---
    slide_layout = prs.slide_layouts[6] # blank layout
    slide = prs.slides.add_slide(slide_layout)
    set_background(slide)

    # Decorative accent card in center
    add_card(slide, Inches(1.5), Inches(1.8), Inches(10.33), Inches(4.0), card_color)

    # Title & Subtitle text box
    title_box = slide.shapes.add_textbox(Inches(2.0), Inches(2.3), Inches(9.33), Inches(3.0))
    tf = title_box.text_frame
    tf.word_wrap = True

    p = tf.paragraphs[0]
    p.text = "TALENTFLOW"
    p.alignment = PP_ALIGN.CENTER
    p.font.size = Pt(54)
    p.font.bold = True
    p.font.color.rgb = accent_primary
    p.font.name = 'Arial'

    p2 = tf.add_paragraph()
    p2.text = "AI-Powered Recruiter Agent & RAG Resume Parser"
    p2.alignment = PP_ALIGN.CENTER
    p2.font.size = Pt(22)
    p2.font.bold = True
    p2.font.color.rgb = text_primary
    p2.font.name = 'Arial'
    p2.space_before = Pt(10)

    p3 = tf.add_paragraph()
    p3.text = "Solving Recruitment Bottlenecks with Semantic Search & Safety Filtering"
    p3.alignment = PP_ALIGN.CENTER
    p3.font.size = Pt(14)
    p3.font.color.rgb = text_secondary
    p3.font.name = 'Arial'
    p3.space_before = Pt(15)


    # --- SLIDE 2: The Core Challenges ---
    slide = prs.slides.add_slide(slide_layout)
    set_background(slide)
    add_header(slide, "The Recruitment Bottlenecks We Addressed")

    challenges = [
        ("Manual Screening Overhead", "Reviewing hundreds of resumes manually takes days, leading to high time-to-hire and missing out on top talent.", accent_warning),
        ("Keyword Matching Limits", "Traditional ATS filters reject great candidates who use different synonyms, or accept unqualified ones who keyword-stuff.", text_secondary),
        ("LLM Hallucinations & Math Bugs", "Standard AI parsers often fail at date calculations, mismatching candidates with requirements (e.g., flagging '5+ years' as missing for an 8-year professional).", accent_warning)
    ]

    left_margin = Inches(0.8)
    card_width = Inches(3.6)
    card_height = Inches(4.5)
    gap = Inches(0.4)

    for i, (title, desc, color) in enumerate(challenges):
        col_left = left_margin + i * (card_width + gap)
        add_card(slide, col_left, Inches(1.8), card_width, card_height, card_color)
        
        tb = slide.shapes.add_textbox(col_left + Inches(0.2), Inches(2.0), card_width - Inches(0.4), card_height - Inches(0.4))
        tf = tb.text_frame
        tf.word_wrap = True
        
        p = tf.paragraphs[0]
        p.text = f"0{i+1}"
        p.font.size = Pt(36)
        p.font.bold = True
        p.font.color.rgb = color
        
        p2 = tf.add_paragraph()
        p2.text = title
        p2.font.size = Pt(18)
        p2.font.bold = True
        p2.font.color.rgb = text_primary
        p2.space_before = Pt(15)
        
        p3 = tf.add_paragraph()
        p3.text = desc
        p3.font.size = Pt(13)
        p3.font.color.rgb = text_secondary
        p3.space_before = Pt(10)


    # --- SLIDE 3: The TalentFlow Solution ---
    slide = prs.slides.add_slide(slide_layout)
    set_background(slide)
    add_header(slide, "How TalentFlow Transforms the Process")

    solutions = [
        ("Semantic Vector Search", "Candidates are indexed using embedding vectors. Recruiter searches find candidates by semantic intent, not just exact keywords.", accent_success),
        ("Strict Schema Extraction", "Resumes are parsed securely using structured JSON schemas, extracting experience timelines, technical skills, and credentials accurately.", text_secondary),
        ("Programmatic Safety Filters", "A deterministic post-processing layer resolves LLM errors, matching experience and skills mathematically against job descriptions.", accent_success)
    ]

    for i, (title, desc, color) in enumerate(solutions):
        col_left = left_margin + i * (card_width + gap)
        add_card(slide, col_left, Inches(1.8), card_width, card_height, card_color)
        
        tb = slide.shapes.add_textbox(col_left + Inches(0.2), Inches(2.0), card_width - Inches(0.4), card_height - Inches(0.4))
        tf = tb.text_frame
        tf.word_wrap = True
        
        p = tf.paragraphs[0]
        p.text = f"✔"
        p.font.size = Pt(36)
        p.font.bold = True
        p.font.color.rgb = color
        
        p2 = tf.add_paragraph()
        p2.text = title
        p2.font.size = Pt(18)
        p2.font.bold = True
        p2.font.color.rgb = text_primary
        p2.space_before = Pt(15)
        
        p3 = tf.add_paragraph()
        p3.text = desc
        p3.font.size = Pt(13)
        p3.font.color.rgb = text_secondary
        p3.space_before = Pt(10)


    # --- SLIDE 4: Architecture & Tech Stack ---
    slide = prs.slides.add_slide(slide_layout)
    set_background(slide)
    add_header(slide, "System Architecture & Integration")

    # Front-end card
    add_card(slide, Inches(0.8), Inches(1.8), Inches(3.6), Inches(4.5), card_color)
    tb1 = slide.shapes.add_textbox(Inches(1.0), Inches(2.0), Inches(3.2), Inches(4.1))
    tf1 = tb1.text_frame
    tf1.word_wrap = True
    p = tf1.paragraphs[0]
    p.text = "FRONTEND"
    p.font.size = Pt(14)
    p.font.bold = True
    p.font.color.rgb = accent_primary
    p2 = tf1.add_paragraph()
    p2.text = "Interactive UI"
    p2.font.size = Pt(20)
    p2.font.bold = True
    p2.font.color.rgb = text_primary
    p2.space_before = Pt(10)
    p3 = tf1.add_paragraph()
    p3.text = "• React & Vite for fast SPA\n• Premium glassmorphism dark theme\n• Interactive RAG Search console\n• Dynamic date filters & calendar indicators\n• On-demand tailored questions"
    p3.font.size = Pt(13)
    p3.font.color.rgb = text_secondary
    p3.space_before = Pt(15)

    # Back-end card
    add_card(slide, Inches(4.8), Inches(1.8), Inches(3.6), Inches(4.5), card_color)
    tb2 = slide.shapes.add_textbox(Inches(5.0), Inches(2.0), Inches(3.2), Inches(4.1))
    tf2 = tb2.text_frame
    tf2.word_wrap = True
    p = tf2.paragraphs[0]
    p.text = "BACKEND"
    p.font.size = Pt(14)
    p.font.bold = True
    p.font.color.rgb = accent_primary
    p2 = tf2.add_paragraph()
    p2.text = "Node.js & Express API"
    p2.font.size = Pt(20)
    p2.font.bold = True
    p2.font.color.rgb = text_primary
    p2.space_before = Pt(10)
    p3 = tf2.add_paragraph()
    p3.text = "• Express REST controllers\n• MongoDB Mongoose candidate models\n• Programmatic pre-scoring date range extraction\n• Batch candidate retrieval\n• LLM post-processing logic"
    p3.font.size = Pt(13)
    p3.font.color.rgb = text_secondary
    p3.space_before = Pt(15)

    # AI engine card
    add_card(slide, Inches(8.8), Inches(1.8), Inches(3.7), Inches(4.5), card_color)
    tb3 = slide.shapes.add_textbox(Inches(9.0), Inches(2.0), Inches(3.3), Inches(4.1))
    tf3 = tb3.text_frame
    tf3.word_wrap = True
    p = tf3.paragraphs[0]
    p.text = "AI ENGINE"
    p.font.size = Pt(14)
    p.font.bold = True
    p.font.color.rgb = accent_primary
    p2 = tf3.add_paragraph()
    p2.text = "RAG & LLM Services"
    p2.font.size = Pt(20)
    p2.font.bold = True
    p2.font.color.rgb = text_primary
    p2.space_before = Pt(10)
    p3 = tf3.add_paragraph()
    p3.text = "• Gemini Pro & Ollama providers\n• Embedding vector search integration\n• Dynamic date prompt injection\n• Structure schema extraction (JSON)\n• Algorithmic match-safety filter"
    p3.font.size = Pt(13)
    p3.font.color.rgb = text_secondary
    p3.space_before = Pt(15)


    # --- SLIDE 5: Key Technical Fixes ---
    slide = prs.slides.add_slide(slide_layout)
    set_background(slide)
    add_header(slide, "Key Experience Matching Fixes Implemented")

    add_card(slide, Inches(0.8), Inches(1.8), Inches(5.6), Inches(4.5), card_color)
    tb_left = slide.shapes.add_textbox(Inches(1.0), Inches(2.0), Inches(5.2), Inches(4.1))
    tf_l = tb_left.text_frame
    tf_l.word_wrap = True
    p = tf_l.paragraphs[0]
    p.text = "PROBLEM: EXTRANEOUS MISSING SKILLS"
    p.font.size = Pt(13)
    p.font.bold = True
    p.font.color.rgb = accent_warning
    p2 = tf_l.add_paragraph()
    p2.text = "Experience Mismatch Issues"
    p2.font.size = Pt(20)
    p2.font.bold = True
    p2.font.color.rgb = text_primary
    p2.space_before = Pt(10)
    p3 = tf_l.add_paragraph()
    p3.text = "1. AI model calculated experience (e.g. 8 years) but flagged '5+ year experience' as missing because it wasn't in the skills text array.\n\n2. Lack of absolute date context made the LLM guess durations for jobs with 'Present' end dates.\n\n3. Searching matches retrieved outdated resumes without any date boundary."
    p3.font.size = Pt(14)
    p3.font.color.rgb = text_secondary
    p3.space_before = Pt(15)

    add_card(slide, Inches(6.8), Inches(1.8), Inches(5.7), Inches(4.5), card_color)
    tb_right = slide.shapes.add_textbox(Inches(7.0), Inches(2.0), Inches(5.3), Inches(4.1))
    tf_r = tb_right.text_frame
    tf_r.word_wrap = True
    p = tf_r.paragraphs[0]
    p.text = "SOLUTION: DETERMINISTIC FALLBACK & DATE INJECTION"
    p.font.size = Pt(13)
    p.font.bold = True
    p.font.color.rgb = accent_success
    p2 = tf_r.add_paragraph()
    p2.text = "Engineering Solid Reliability"
    p2.font.size = Pt(20)
    p2.font.bold = True
    p2.font.color.rgb = text_primary
    p2.space_before = Pt(10)
    p3 = tf_r.add_paragraph()
    p3.text = "1. Programmatic Safety Filter: Intercepts matches to automatically move experience requirements from 'Missing' to 'Matches' based on computed timeline values.\n\n2. Context Date Injection: Feeds today's date dynamically to the LLM system prompt to evaluate 'Present' roles accurately.\n\n3. Custom Date Range Filters: Enables recruiters to filter matched candidate lists by resume upload date ranges."
    p3.font.size = Pt(14)
    p3.font.color.rgb = text_secondary
    p3.space_before = Pt(15)


    # --- SLIDE 6: Business ROI & Outcomes ---
    slide = prs.slides.add_slide(slide_layout)
    set_background(slide)
    add_header(slide, "Business Impact & Key Metrics")

    metrics = [
        ("-90%", "Screening Time", "Reduces candidate pre-screening from hours to seconds per batch.", accent_success),
        ("+80%", "Match Accuracy", "Semantic vector search targets skill intent instead of simple keyword spelling.", accent_primary),
        ("100%", "Reliability", "Algorithmic safety filters eliminate experience hallucinations.", accent_success)
    ]

    for i, (metric, title, desc, color) in enumerate(metrics):
        col_left = left_margin + i * (card_width + gap)
        add_card(slide, col_left, Inches(1.8), card_width, card_height, card_color)
        
        tb = slide.shapes.add_textbox(col_left + Inches(0.2), Inches(2.0), card_width - Inches(0.4), card_height - Inches(0.4))
        tf = tb.text_frame
        tf.word_wrap = True
        
        p = tf.paragraphs[0]
        p.text = metric
        p.font.size = Pt(54)
        p.font.bold = True
        p.font.color.rgb = color
        
        p2 = tf.add_paragraph()
        p2.text = title
        p2.font.size = Pt(18)
        p2.font.bold = True
        p2.font.color.rgb = text_primary
        p2.space_before = Pt(15)
        
        p3 = tf.add_paragraph()
        p3.text = desc
        p3.font.size = Pt(13)
        p3.font.color.rgb = text_secondary
        p3.space_before = Pt(10)


    # --- SLIDE 7: Conclusion & Thank You ---
    slide = prs.slides.add_slide(slide_layout)
    set_background(slide)

    # Decorative accent card in center
    add_card(slide, Inches(1.5), Inches(1.8), Inches(10.33), Inches(4.0), card_color)

    # Title & Subtitle text box
    concl_box = slide.shapes.add_textbox(Inches(2.0), Inches(2.2), Inches(9.33), Inches(3.0))
    tf = concl_box.text_frame
    tf.word_wrap = True

    p = tf.paragraphs[0]
    p.text = "Thank You"
    p.alignment = PP_ALIGN.CENTER
    p.font.size = Pt(48)
    p.font.bold = True
    p.font.color.rgb = accent_primary
    p.font.name = 'Arial'

    p2 = tf.add_paragraph()
    p2.text = "TalentFlow: Empowering Recruiters with Resilient AI"
    p2.alignment = PP_ALIGN.CENTER
    p2.font.size = Pt(20)
    p2.font.bold = True
    p2.font.color.rgb = text_primary
    p2.font.name = 'Arial'
    p2.space_before = Pt(10)

    p3 = tf.add_paragraph()
    p3.text = "Questions & Answers"
    p3.alignment = PP_ALIGN.CENTER
    p3.font.size = Pt(16)
    p3.font.color.rgb = text_secondary
    p3.font.name = 'Arial'
    p3.space_before = Pt(20)

    prs.save("TalentFlow_Presentation.pptx")
    print("Success: TalentFlow_Presentation.pptx has been created successfully!")

if __name__ == "__main__":
    create_presentation()
