from __future__ import annotations

from pathlib import Path


FILES = [
    Path("index.html"),
    Path("admin.html"),
    Path("script.js"),
    Path("admin.js"),
    Path("style.css"),
    Path("server/index.js"),
    Path("server/README.md"),
    Path("assets/image/video-poster.svg"),
]


REPLACEMENTS: list[tuple[str, str]] = [
    # Common UTF-8 bytes mis-decoded as CP1252/Latin-1 and re-saved.
    ("Ã©", "é"),
    ("Ã¨", "è"),
    ("Ãª", "ê"),
    ("Ã«", "ë"),
    ("Ã‰", "É"),
    ("Ã€", "À"),
    ("Ãˆ", "È"),
    ("ÃŠ", "Ê"),
    ("Ã‹", "Ë"),
    ("Ã§", "ç"),
    ("Ã‡", "Ç"),
    ("Ã ", "à"),  # sometimes shows as Ã + space
    ("Ã ", "à"),  # common: Ã + NBSP
    ("Ã¢", "â"),
    ("Ã¤", "ä"),
    ("Ã´", "ô"),
    ("Ã¶", "ö"),
    ("Ã®", "î"),
    ("Ã¯", "ï"),
    ("Ã¹", "ù"),
    ("Ã»", "û"),
    ("Ã¼", "ü"),
    ("â€”", "—"),
    ("â€“", "–"),
    ("â€™", "’"),
    # Occasional stray control marker
    ("Â", ""),
]


def fix_text(text: str) -> str:
    out = text
    for before, after in REPLACEMENTS:
        out = out.replace(before, after)
    return out


def main() -> int:
    changed = 0
    for path in FILES:
        if not path.exists():
            continue
        before = path.read_text(encoding="utf-8", errors="replace")
        after = fix_text(before)
        if after != before:
            path.write_text(after, encoding="utf-8", newline="\n")
            changed += 1
            print(f"fixed: {path.as_posix()}")

    print(f"done. files changed: {changed}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
