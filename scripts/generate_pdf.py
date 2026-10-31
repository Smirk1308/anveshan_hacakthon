import os
import subprocess
import markdown
from pathlib import Path

def convert_md_to_pdf():
    brain_dir = Path(r"C:\Users\Akash\.gemini\antigravity\brain\dfb13b71-9622-418f-9f6d-20164d73f273")
    md_file = brain_dir / "PROJECT_COMPREHENSIVE_GUIDE.md"
    html_file = brain_dir / "temp_guide.html"
    pdf_brain = brain_dir / "SANJEEVANI_PROJECT_GUIDE.pdf"
    
    project_dir = Path(r"C:\Users\Akash\.gemini\antigravity\scratch\anveshan_hacakthon")
    pdf_public = project_dir / "public" / "SANJEEVANI_PROJECT_GUIDE.pdf"
    pdf_root = project_dir / "SANJEEVANI_PROJECT_GUIDE.pdf"

    with open(md_file, "r", encoding="utf-8") as f:
        md_content = f.read()

    # Convert markdown to HTML with tables, code, and attr lists
    body_html = markdown.markdown(
        md_content,
        extensions=["tables", "fenced_code", "toc", "attr_list", "nl2br"]
    )

    styled_html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Sanjeevani (SahayAI) - Comprehensive Project & Defense Guide</title>
    <style>
        @page {{
            size: A4;
            margin: 20mm 15mm 20mm 15mm;
            @bottom-right {{
                content: counter(page);
            }}
        }}
        
        body {{
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            color: #1e293b;
            background-color: #ffffff;
            line-height: 1.6;
            font-size: 11pt;
            margin: 0;
            padding: 0;
        }}

        .header-banner {{
            background: linear-gradient(135deg, #064e3b 0%, #047857 100%);
            color: #ffffff;
            padding: 24px 30px;
            border-radius: 8px;
            margin-bottom: 25px;
        }}

        .header-banner h1 {{
            margin: 0 0 8px 0;
            color: #ffffff;
            font-size: 22pt;
            letter-spacing: -0.5px;
        }}

        .header-banner p {{
            margin: 0;
            color: #a7f3d0;
            font-size: 12pt;
            font-weight: 500;
        }}

        h1, h2, h3, h4 {{
            color: #0f172a;
            font-weight: 700;
            page-break-after: avoid;
        }}

        h2 {{
            font-size: 15pt;
            border-bottom: 2px solid #e2e8f0;
            padding-bottom: 6px;
            margin-top: 28px;
            color: #065f46;
        }}

        h3 {{
            font-size: 12pt;
            margin-top: 20px;
            color: #1e293b;
        }}

        p, li {{
            color: #334155;
            text-align: justify;
        }}

        table {{
            width: 100%;
            border-collapse: collapse;
            margin: 16px 0;
            font-size: 9.5pt;
            page-break-inside: avoid;
        }}

        th, td {{
            border: 1px solid #cbd5e1;
            padding: 8px 10px;
            text-align: left;
        }}

        th {{
            background-color: #f1f5f9;
            color: #0f172a;
            font-weight: 600;
        }}

        tr:nth-child(even) {{
            background-color: #f8fafc;
        }}

        blockquote {{
            border-left: 4px solid #10b981;
            margin: 16px 0;
            padding: 10px 18px;
            background-color: #f0fdf4;
            color: #166534;
            border-radius: 0 6px 6px 0;
            page-break-inside: avoid;
        }}

        blockquote p {{
            margin: 0;
            color: #166534;
        }}

        code {{
            background-color: #f1f5f9;
            color: #0f172a;
            padding: 2px 5px;
            border-radius: 4px;
            font-family: Consolas, "Courier New", monospace;
            font-size: 9pt;
        }}

        pre {{
            background-color: #0f172a;
            color: #f8fafc;
            padding: 14px;
            border-radius: 6px;
            overflow-x: auto;
            font-size: 8.5pt;
            line-height: 1.45;
            page-break-inside: avoid;
        }}

        pre code {{
            background-color: transparent;
            color: #f8fafc;
            padding: 0;
        }}

        hr {{
            border: none;
            border-top: 1px solid #e2e8f0;
            margin: 24px 0;
        }}

        .badge {{
            display: inline-block;
            padding: 2px 8px;
            background: #d1fae5;
            color: #065f46;
            border-radius: 12px;
            font-size: 8.5pt;
            font-weight: 600;
        }}
    </style>
</head>
<body>
    <div class="header-banner">
        <h1>Sanjeevani (SahayAI)</h1>
        <p>Comprehensive System Architecture, Technical Deep-Dive & Evaluation Defense Dossier</p>
    </div>
    {body_html}
</body>
</html>"""

    with open(html_file, "w", encoding="utf-8") as f:
        f.write(styled_html)

    edge_bin = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
    if not os.path.exists(edge_bin):
        edge_bin = r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"

    print("Generating PDF via Microsoft Edge Headless...")
    cmd = [
        edge_bin,
        "--headless",
        "--disable-gpu",
        "--run-all-compositor-stages-before-draw",
        f"--print-to-pdf={pdf_brain}",
        str(html_file)
    ]
    subprocess.run(cmd, check=True)
    print("PDF generated at:", pdf_brain)

    # Copy to public folder so it can be downloaded via browser
    os.makedirs(pdf_public.parent, exist_ok=True)
    with open(pdf_brain, "rb") as src, open(pdf_public, "wb") as dst:
        dst.write(src.read())
    with open(pdf_brain, "rb") as src, open(pdf_root, "wb") as dst:
        dst.write(src.read())

    print("Copied to:", pdf_public)
    print("Copied to:", pdf_root)
    print("PDF file size:", os.path.getsize(pdf_brain), "bytes")

if __name__ == "__main__":
    convert_md_to_pdf()
