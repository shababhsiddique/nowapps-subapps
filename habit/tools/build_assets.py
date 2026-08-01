#!/usr/bin/env python3
"""Turn the app's sprite sheets into web assets.

Source of truth is the art repo next door (see HabitBuilder-code/README.md):

    HabitBuilder/art/skins/classic/stages/{0,1}                   PNG masters
    HabitBuilder-code/assets/sprites/skins/classic/stages/{0,1}   bundled stages
    HabitBuilder/cdn/sprites/skins/classic/stages/{2..11}         CDN stages
    HabitBuilder/cdn/sprites/ornaments/<group>/<name>-spritesheet.png

The hero alone is built from the PNG masters. Everything else comes off the
shipped WebP, which is fine for art that flashes past mid-scroll but not for the
first thing anyone sees — re-encoding a lossy file stacks a second generation of
artefacts on it.

Nothing here runs at deploy time — the outputs are committed. Re-run it only
when the art changes:

    python3 tools/build_assets.py

Two kinds of output, because two kinds of motion:

  * Sheets  — the hero's stage-1 idle loop (5x5/25f) and the ornaments (7x7),
    played frame-by-frame with CSS `steps()`. Sprite sheets with alpha are
    expensive, so only these get one.
  * Frames  — one still per stage for the scroll acts. At 640px they cost
    ~57KB each against ~230KB for even a trimmed idle sheet, and the page
    gives them their life with a CSS sway instead.

Frames are never cropped to their content. Every stage shares one island
anchored at the same place in the square, and cropping each to its own bounding
box would slide the island around as the tree grows.
"""

import io
import json
import os
import sys
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
WEB = HERE.parent
APP = WEB.parent / "HabitBuilder-code"
ART = WEB.parent / "HabitBuilder"

BUNDLED = APP / "assets/sprites/skins/classic/stages"
CDN = ART / "cdn/sprites/skins/classic/stages"
ORNAMENTS = ART / "cdn/sprites/ornaments"

# The hero comes off the master PNGs instead of the shipped WebP. Both are the
# same pixel dimensions, but the WebP is already lossy, so re-encoding it stacks
# a second generation of artefacts onto the one thing a visitor looks at first.
MASTER = ART / "art/skins/classic/stages"

OUT_TREE = WEB / "assets/tree"
OUT_ORN = WEB / "assets/orn"

# Stage frame size. The tree is drawn between 300 and 480 CSS px, so 640
# leaves headroom for 2x displays on the smaller stages without paying for
# a sheet's worth of bytes.
STAGE_PX = 640
STAGE_Q = 82

# --- the hero ----------------------------------------------------------------
# One sprite: the stage-2 idle loop, at the master's full frame size. It is the
# resting state a visitor looks at for as long as they are on the page, so it is
# the one asset on the site built purely for quality. The stage-2 still shown
# underneath it while it loads is STAGE_PX, built with all the other stages.
HERO_STAGE = 2
IDLE_PX = 512     # native: 2560px sheet / 5 columns
IDLE_Q = 90

# Cropping every frame to the artwork's shared bounding box was measured and
# rejected: it removes 41% of the canvas but only ~3% of the bytes, because
# WebP already compresses a uniformly transparent margin to almost nothing.
# It would only have bought a non-square aspect ratio to keep in sync.

# Ornaments are drawn between 48 and 80px. They are decoration on one act, so
# they are tuned hard: WebP spends most of its bytes on the alpha plane for
# these cut-out sheets, and dropping `alpha_quality` costs nothing visible at
# this size while halving the file.
ORN_PX = 56
ORN_Q = 70
ORN_ALPHA_Q = 55

# The wilt act drains one stage through its health tiers.
WILT_STAGE = 5
WILT_TIERS = (100, 50, 25)

# Which ornaments land on the tree in act 3, and where they land. Positions are
# fractions of the tree square, eyeballed against stage 7's canopy.
ORNAMENT_SET = [
    ("birds/bird_blue", "bird", 0.62, 0.34),
    ("birds/bird_yellow", "bird", 0.28, 0.42),
    ("insects/butterfly_pink", "flit", 0.74, 0.55),
    ("insects/butterfly_purple", "flit", 0.19, 0.61),
    ("wildflowers/clover", "ground", 0.38, 0.82),
    ("wildflowers/cherry_blossom", "ground", 0.68, 0.85),
    ("animals/squirrel_red", "bird", 0.45, 0.50),
    ("insects/snail_purple", "ground", 0.24, 0.86),
    # Not on the tree — one each for the header of terms / privacy / support.
    ("birds/owl", "page", 0.0, 0.0),
    ("birds/bird_pink", "page", 0.0, 0.0),
    ("insects/butterfly_yellow", "page", 0.0, 0.0),
]


def stage_dir(stage: int) -> Path:
    """Stages 0-1 ship inside the app; 2+ live in the art repo's CDN staging."""
    return (BUNDLED if stage <= 1 else CDN) / str(stage)


def frames_of(sheet: Image.Image, cols: int, count: int):
    w = sheet.size[0] // cols
    rows = -(-count // cols)
    h = sheet.size[1] // rows
    return [
        sheet.crop(((i % cols) * w, (i // cols) * h, (i % cols) * w + w, (i // cols) * h + h))
        for i in range(count)
    ]


def save(img: Image.Image, path: Path, quality: int, alpha_quality: int = 100) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, "WEBP", quality=quality, method=6, alpha_quality=alpha_quality)
    return path.stat().st_size


def repack(src: Path, dst: Path, cols: int, count: int, frame_px: int, quality: int,
           alpha_quality: int = 100) -> int:
    """Downscale a sprite sheet, keeping its grid."""
    sheet = Image.open(src).convert("RGBA")
    rows = -(-count // cols)
    out = Image.new("RGBA", (cols * frame_px, rows * frame_px), (0, 0, 0, 0))
    for i, frame in enumerate(frames_of(sheet, cols, count)):
        out.paste(frame.resize((frame_px, frame_px), Image.LANCZOS),
                  ((i % cols) * frame_px, (i // cols) * frame_px))
    return save(out, dst, quality, alpha_quality)


def still(src: Path, dst: Path, cols: int, index: int, px: int, quality: int) -> int:
    """Pull one frame out of a sheet at full size."""
    sheet = Image.open(src).convert("RGBA")
    frame = frames_of(sheet, cols, cols * cols)[index]
    return save(frame.resize((px, px), Image.LANCZOS), dst, quality)


def main() -> int:
    for required in (BUNDLED, CDN, ORNAMENTS):
        if not required.exists():
            print(f"missing source: {required}\n"
                  f"the art repo must sit next to this one — see the module docstring",
                  file=sys.stderr)
            return 1

    total = 0
    manifest = {"stages": {}, "ornaments": []}

    # --- hero -------------------------------------------------------------
    # The stage-2 idle loop, and nothing else. The stage-0 grow sheet (the seed
    # sprouting) used to play once on load; it was cut because the animation
    # itself did not look good, not for weight. The hero's other layer is the
    # stage-2 still built below, which both the hero and the acts use.
    idle_src = MASTER / f"{HERO_STAGE}/idle/idle_100.png"
    if not idle_src.exists():
        print(f"missing hero master: {idle_src}", file=sys.stderr)
        return 1

    hero_out = f"idle-{HERO_STAGE}.webp"
    n = repack(idle_src, OUT_TREE / hero_out,
               cols=5, count=25, frame_px=IDLE_PX, quality=IDLE_Q)
    print(f"  {hero_out}        5x5/25f  {IDLE_PX}px  {n // 1024:>4} KB   (from PNG master)")
    total += n

    # Anything left by an older run would otherwise sit in the deploy unused —
    # including a hero sheet from a stage the site no longer opens on.
    for stale in ("sprout.webp", "seed.webp",
                  *(f"idle-{s}.webp" for s in range(1, 11) if s != HERO_STAGE)):
        old = OUT_TREE / stale
        if old.exists():
            old.unlink()
            print(f"  removed {stale} (no longer used by the page)")

    # --- stage stills -----------------------------------------------------
    # Frame 24 is the idle loop's rest pose (the sheets hold on their last
    # frame), so it is the tree at its most settled.
    for stage in range(1, 11):
        src = stage_dir(stage) / "idle_100.webp"
        n = still(src, OUT_TREE / f"stage-{stage}.webp", 5, 24, STAGE_PX, STAGE_Q)
        manifest["stages"][stage] = f"assets/tree/stage-{stage}.webp"
        total += n
        print(f"  stage-{stage}.webp{'':<{8 - len(str(stage))}} still    {STAGE_PX}px  {n // 1024:>4} KB")

    # --- wilt -------------------------------------------------------------
    for tier in WILT_TIERS[1:]:
        src = stage_dir(WILT_STAGE) / f"idle_{tier}.webp"
        dst = OUT_TREE / f"stage-{WILT_STAGE}-h{tier}.webp"
        n = still(src, dst, 5, 24, STAGE_PX, STAGE_Q)
        total += n
        print(f"  stage-{WILT_STAGE}-h{tier}.webp  still    {STAGE_PX}px  {n // 1024:>4} KB")

    # --- ornaments --------------------------------------------------------
    for rel, kind, x, y in ORNAMENT_SET:
        name = rel.split("/")[-1]
        src = ORNAMENTS / f"{rel}-spritesheet.png"
        if not src.exists():
            print(f"  ! skipped {name} (no sheet at {src})")
            continue
        n = repack(src, OUT_ORN / f"{name}.webp", cols=7, count=49,
                   frame_px=ORN_PX, quality=ORN_Q, alpha_quality=ORN_ALPHA_Q)
        total += n
        manifest["ornaments"].append(
            {"name": name, "kind": kind, "x": x, "y": y,
             "src": f"assets/orn/{name}.webp"})
        print(f"  {name}.webp{'':<{18 - len(name)}} 7x7/49f  {ORN_PX}px  {n // 1024:>4} KB")

    (WEB / "assets/manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"\n  {total // 1024} KB of art total")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
