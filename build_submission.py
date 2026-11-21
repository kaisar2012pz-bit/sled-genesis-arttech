"""Build the two-page overview and the captioned browser demonstration."""
import os
from pathlib import Path
import subprocess
import tempfile

from imageio_ffmpeg import get_ffmpeg_exe
from pypdf import PdfReader
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen.canvas import Canvas
from reportlab.platypus import Paragraph

root = Path(__file__).resolve().parent
out = root / "submission"
font_dir = Path(os.environ["WINDIR"]) / "Fonts"
pdfmetrics.registerFont(TTFont("Body", str(font_dir / "segoeui.ttf")))
pdfmetrics.registerFont(TTFont("Title", str(font_dir / "georgia.ttf")))
pdfmetrics.registerFont(TTFont("Bold", str(font_dir / "segoeuib.ttf")))
pdfmetrics.registerFontFamily("Body",normal="Body",bold="Bold")

document = Canvas(str(out / "About-Sled.pdf"), pagesize=(595,842))
document.setTitle("След — дневник ощущений")
document.setFillColor(colors.HexColor("#f3f0e6"))
document.rect(0,0,595,842,fill=1,stroke=0)
document.setFillColor(colors.HexColor("#4b503d"))
document.setFont("Bold",10)
document.drawString(46,790,"GENESIS HACKATHON / ARTTECH")
document.setFillColor(colors.HexColor("#1c2117"))
document.setFont("Title",60)
document.drawString(42,717,"След")
document.setFont("Body",18)
document.drawString(46,682,"Интерактивный дневник ощущений")
document.setStrokeColor(colors.HexColor("#8b8d7b"))
document.line(46,656,549,656)
style = ParagraphStyle("body",fontName="Body",fontSize=11,leading=16,textColor=colors.HexColor("#22261c"))
y = 630
for line in (out / "ABOUT.md").read_text(encoding="utf-8-sig").splitlines():
    if not line.startswith("**") or ".**" not in line:
        continue
    header, body = line[2:].split(".** ",1)
    paragraph = Paragraph(f"<b>{header}.</b> {body}",style)
    _,height = paragraph.wrap(503,650)
    paragraph.drawOn(document,46,y-height)
    y -= height+14
assert y > 48, y
document.setFont("Body",9)
document.drawString(46,37,"ПРОТОТИП   /   19–22 НОЯБРЯ 2026")
document.showPage()
document.setFillColor(colors.HexColor("#f3f0e6"))
document.rect(0,0,595,842,fill=1,stroke=0)
document.setFillColor(colors.HexColor("#4b503d"))
document.setFont("Bold",10)
document.drawString(46,790,"GENESIS HACKATHON / ARTTECH")
document.setFillColor(colors.HexColor("#1c2117"))
document.setFont("Title",29)
document.drawString(46,745,"Приёмы и реализация")
document.setStrokeColor(colors.HexColor("#8b8d7b"))
document.line(46,724,549,724)
y = 705
details = (out / "REFERENCES.md").read_text(encoding="utf-8-sig").split("## Демонстрационные")[0]
rows = []
for line in details.splitlines():
    if line.startswith("- **"):
        header, body = line[4:].split(".** ",1)
        rows.append((header,body))
rows += [
    ("Стек", "HTML, CSS, JavaScript, Canvas 2D, Web Audio API, IndexedDB и Speech Synthesis. Для Spotify доступен официальный плеер. Хранение осуществляется локально, в браузере посетителя."),
    ("Материалы", "Пять вымышленных записей, фотографии из Unsplash и пять оригинальных треков, синтезированных на Python. Файлы, исходники и ссылки на фото перечислены в комплекте."),
    ("Инструменты", "Python и ReportLab для документации, Playwright и Edge для проверки, FFmpeg для видео. OpenAI Codex использовался при разработке и создании материалов."),
]
for header, body in rows:
    paragraph = Paragraph(f"<b>{header}.</b> {body}",style)
    _,height = paragraph.wrap(503,650)
    paragraph.drawOn(document,46,y-height)
    y -= height+10
assert y > 48, y
document.setFont("Body",9)
document.drawString(46,37,"СЛЕД   /   ВИЗУАЛЬНАЯ СИСТЕМА И СТЕК")
document.save()
assert len(PdfReader(out / "About-Sled.pdf").pages)==2

frames = Path(tempfile.gettempdir()) / "sled-capture"
timing = [8,12,11,8,12,10,9,10]
with tempfile.TemporaryDirectory(dir=frames) as work:
    listing = Path(work) / "frames.txt"
    rows = []
    for i, seconds in enumerate(timing,1):
        frame = (frames / f"{i}.png").as_posix()
        rows.extend([f"file '{frame}'",f"duration {seconds}"])
    rows.append(f"file '{frame}'")
    listing.write_text("\n".join(rows),encoding="utf-8")
    ffmpeg = get_ffmpeg_exe()
    audio = root / "dist" / "media"
    subprocess.run([ffmpeg,"-hide_banner","-loglevel","error","-y",
        "-f","concat","-safe","0","-i",str(listing),
        "-stream_loop","-1","-i",str(audio/"park.wav"),
        "-stream_loop","-1","-i",str(audio/"office.wav"),
        "-stream_loop","-1","-i",str(audio/"sea.wav"),
        "-filter_complex",
        "[1:a]atrim=0:61,afade=t=in:d=2,afade=t=out:st=59:d=2[a];"
        "[2:a]atrim=0:9,afade=t=in:d=0.7,afade=t=out:st=8:d=1[b];"
        "[3:a]atrim=0:10,afade=t=in:d=1,afade=t=out:st=8:d=2[c];"
        "[a][b][c]concat=n=3:v=0:a=1[music]",
        "-map","0:v","-map","[music]","-c:v","libx264","-r","25",
        "-pix_fmt","yuv420p","-preset","fast","-crf","20",
        "-c:a","aac","-b:a","120k","-movflags","+faststart","-t",str(sum(timing)),
        str(out/"Sled-demo.mp4")],check=True)
