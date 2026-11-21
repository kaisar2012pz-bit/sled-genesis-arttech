"""Bundle the static prototype as a single HTML file for offline use."""
import base64
import json
from pathlib import Path

root = Path(__file__).resolve().parent
dist = root / "dist"
read = lambda name: (dist / name).read_text(encoding="utf-8-sig")
media = {
    path.name: "data:" + ({"jpg": "image/jpeg", "wav": "audio/wav"}[path.suffix[1:]])
    + ";base64," + base64.b64encode(path.read_bytes()).decode("ascii")
    for path in sorted((dist / "media").iterdir())
    if path.suffix in {".jpg", ".wav"}
}
engine = read("engine.js").replace("export ", "")
app = read("app.js").split("\n", 1)[1]
app = app.replace("'media/'+name+'.jpg'", "offlineMedia[name+'.jpg']")
app = app.replace("'media/'+item.id+'.wav'", "offlineMedia[item.id+'.wav']")
html = read("index.html").replace('<link rel="stylesheet" href="style.css">', "<style>"+read("style.css")+"</style>")
html = html.replace('<link rel="stylesheet" href="memory.css">', "<style>"+read("memory.css")+"</style>")
html = html.replace('<link rel="stylesheet" href="genesis-inspired.css">', "<style>"+read("genesis-inspired.css")+"</style>")
html = html.replace('<link rel="stylesheet" href="genesis-inspired.css">', "<style>"+read("genesis-inspired.css")+"</style>")
script = "<script type='module'>\nconst offlineMedia = "+json.dumps(media)+";\n"+engine+"\n"+app+"\n</script>"
html = html.replace('<script type="module" src="app.js"></script>', script)
(root / "Sled.html").write_text(html, encoding="utf-8")
