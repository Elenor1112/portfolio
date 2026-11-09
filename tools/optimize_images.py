"""Build the optimized WebP screenshots in assets/img from the original project folders.

Run from the portfolio root:  python tools/optimize_images.py [slug ...]
With slugs, only those projects are rebuilt; projects whose source folder is missing are skipped.
Requires Pillow (pip install pillow). Re-running overwrites the output of the projects it builds.
"""
import json
import os
import re
import shutil
import sys
from PIL import Image, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "img")

# Numbered screenshots (1.png, 2.jpeg, 2(2).png, ...) are picked up in numeric order and saved as
# 01, 02, 02b, ... Portrait shots no wider than 720px are treated as phone screens.
NUMBERED = {
    "elenor-website": "Elenor Website",
    "elenor-os": "HR System",
    "gts-erp": "Storage HR Accounting System",
    "geo-audit": "GEO Agent",
    "adlens": "AdLens",
    "herts-quest": "Herts Quest (Game)",
    # Screenshots taken from the running apps, kept out of git (see .gitignore)
    "ai-caller": os.path.join("_shots", "ai-caller"),
    "meta-bot": os.path.join("_shots", "meta-bot"),
    "nfc-card": os.path.join("_shots", "nfc-card"),
    "mutism": os.path.join("_shots", "mutism"),
}

# slug -> (source folder, [(output name, source file, kind)])
# kind "desktop" -> 1600w + 800w, kind "phone" -> 720w + 360w
MANIFEST = {
    "church-app": ("Church App", [
        ("dashboard", "WhatsApp Image 2026-09-27 at 1.54.01 PM (3).jpeg", "phone"),
        ("meetings", "WhatsApp Image 2026-09-27 at 1.54.01 PM (2).jpeg", "phone"),
        ("profile", "WhatsApp Image 2026-09-27 at 1.54.01 PM (1).jpeg", "phone"),
        ("attendance", "WhatsApp Image 2026-09-27 at 1.54.01 PM.jpeg", "phone"),
    ]),
    "off-script": (os.path.join("assets", "Off Script"), [
        ("01", "1.png", "desktop"),
        ("02", "2.png", "desktop"),
        ("03", "3.png", "desktop"),
        ("04", "4.png", "desktop"),
        ("05", "5.png", "desktop"),
        ("06", "6.png", "desktop"),
        ("07", "7.png", "desktop"),
        ("08", "8.png", "desktop"),
        ("09", "9.png", "desktop"),
        ("10", "10.png", "desktop"),
    ]),
}


def numbered(folder):
    files = [f for f in os.listdir(os.path.join(ROOT, folder)) if re.fullmatch(r"\d+(\(\d+\))?\.(png|jpe?g)", f, re.I)]
    files.sort(key=lambda f: [int(n) for n in re.findall(r"\d+", f)])
    items = []
    for f in files:
        base, *dup = re.findall(r"\d+", f)
        name = f"{int(base):02d}" + ("b" if dup else "")
        w, h = Image.open(os.path.join(ROOT, folder, f)).size
        items.append((name, f, "phone" if h > w * 1.6 and w <= 720 else "desktop"))
    return items


SIZES = {"desktop": (1600, 800), "phone": (720, 360)}


def save(im, width, path):
    if im.width > width:
        im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    im.save(path, "WEBP", quality=78, method=6)
    return im.size


def main(only):
    manifest_path = os.path.join(OUT, "manifest.json")
    manifest = json.load(open(manifest_path)) if os.path.exists(manifest_path) else {}
    total = 0
    wanted = lambda slug, folder: (not only or slug in only) and os.path.isdir(os.path.join(ROOT, folder))
    sources = {slug: (folder, numbered(folder)) for slug, folder in NUMBERED.items() if wanted(slug, folder)}
    sources.update({slug: v for slug, v in MANIFEST.items() if wanted(slug, v[0])})
    for slug, (folder, items) in sources.items():
        manifest = {k: v for k, v in manifest.items() if not k.startswith(slug + "/")}
        shutil.rmtree(os.path.join(OUT, slug), ignore_errors=True)  # drop shots that no longer exist
        os.makedirs(os.path.join(OUT, slug))
        for name, src, kind in items:
            im = ImageOps.exif_transpose(Image.open(os.path.join(ROOT, folder, src))).convert("RGB")
            large, small = SIZES[kind]
            w, h = save(im, large, os.path.join(OUT, slug, f"{name}-{large}.webp"))
            save(im, small, os.path.join(OUT, slug, f"{name}-{small}.webp"))
            manifest[f"{slug}/{name}"] = {"w": w, "h": h, "kind": kind, "large": large, "small": small}
            for size in (large, small):
                total += os.path.getsize(os.path.join(OUT, slug, f"{name}-{size}.webp"))

    # Social preview image from the Elenor Website hero shot
    if "elenor-website" in sources:
        og = ImageOps.exif_transpose(Image.open(os.path.join(ROOT, "Elenor Website", "1.png"))).convert("RGB")
        og = ImageOps.fit(og, (1200, 630), Image.LANCZOS)
        og.save(os.path.join(OUT, "og.jpg"), "JPEG", quality=80, optimize=True)

    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)
    print(f"built {', '.join(sources) or 'nothing'}: {total / 1024:.0f} KB WebP; manifest has {len(manifest)} images")


if __name__ == "__main__":
    main(set(sys.argv[1:]))
