#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""脚手架：轻量追溯四轨归档文件。

用法:
  python scripts/new_archive.py req 主题短名
  python scripts/new_archive.py err 主题短名
  python scripts/new_archive.py upd 主题短名
  python scripts/new_archive.py sess 主题短名

可选: --date YYYY-MM-DD（默认今天）
"""
from __future__ import annotations

import argparse
import re
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

KINDS = {
    "req": {
        "dir": ROOT / "docs" / "requirements",
        "template": ROOT / "docs" / "requirements" / "_模板-需求归档.md",
        "prefix": "需求归档",
        "index": ROOT / "docs" / "requirements" / "需求归档-索引.md",
        "index_section": None,
    },
    "err": {
        "dir": ROOT / "docs" / "records",
        "template": ROOT / "docs" / "records" / "_模板-错误归档.md",
        "prefix": "错误归档",
        "index": ROOT / "docs" / "records" / "归档索引.md",
        "index_section": "## 错误归档",
    },
    "upd": {
        "dir": ROOT / "docs" / "records",
        "template": ROOT / "docs" / "records" / "_模板-更新归档.md",
        "prefix": "更新归档",
        "index": ROOT / "docs" / "records" / "归档索引.md",
        "index_section": "## 更新归档",
    },
    "sess": {
        "dir": ROOT / "docs" / "records",
        "template": ROOT / "docs" / "records" / "_模板-会话归档.md",
        "prefix": "会话归档",
        "index": ROOT / "docs" / "records" / "归档索引.md",
        "index_section": "## 会话归档",
    },
}


def slugify(s: str) -> str:
    s = s.strip().replace(" ", "")
    s = re.sub(r'[<>:"/\\|?*]', "", s)
    return s or "未命名"


def fill_template(text: str, day: str, title: str) -> str:
    text = text.replace("YYYY-MM-DD", day)
    text = text.replace("{主题}", title)
    lines = text.splitlines()
    if lines:
        # Normalize H1 to include title when template already expanded
        h1 = lines[0]
        if h1.startswith("# ") and title not in h1:
            # e.g. "# 需求归档 · " leftover empty
            if h1.rstrip().endswith("·") or h1.rstrip().endswith("· "):
                lines[0] = h1.rstrip() + " " + title
        text = "\n".join(lines)
        if not text.endswith("\n"):
            text += "\n"
    return text


def prepend_index_row(index_path: Path, section: str | None, row: str) -> None:
    if not index_path.is_file():
        return
    body = index_path.read_text(encoding="utf-8")
    if not row.endswith("\n"):
        row += "\n"

    if section:
        if section not in body:
            return
        pos = body.find(section)
        before = body[:pos]
        rest = body[pos:]
        lines = rest.splitlines(keepends=True)
        insert_at = None
        for i, line in enumerate(lines):
            if re.match(r"^\|[-: |]+\|$", line.strip()):
                insert_at = i + 1
                break
        if insert_at is None:
            return
        lines.insert(insert_at, row)
        index_path.write_text(before + "".join(lines), encoding="utf-8")
        return

    lines = body.splitlines(keepends=True)
    for i, line in enumerate(lines):
        if re.match(r"^\|[-: |]+\|$", line.strip()):
            lines.insert(i + 1, row)
            index_path.write_text("".join(lines), encoding="utf-8")
            return


def main() -> int:
    ap = argparse.ArgumentParser(description="新建轻量追溯归档文件")
    ap.add_argument("kind", choices=sorted(KINDS.keys()), help="req|err|upd|sess")
    ap.add_argument("title", help="主题短名（用于文件名与标题）")
    ap.add_argument("--date", default=date.today().isoformat(), help="YYYY-MM-DD")
    ap.add_argument("--no-index", action="store_true", help="不改索引")
    args = ap.parse_args()

    meta = KINDS[args.kind]
    day = args.date
    title = slugify(args.title)
    tpl_path: Path = meta["template"]
    if not tpl_path.is_file():
        print(f"缺少模板: {tpl_path}", file=sys.stderr)
        return 1

    out_name = f"{meta['prefix']}-{day}-{title}.md"
    out_path: Path = meta["dir"] / out_name
    if out_path.exists():
        print(f"已存在: {out_path}", file=sys.stderr)
        return 2

    text = fill_template(tpl_path.read_text(encoding="utf-8"), day, title)
    meta["dir"].mkdir(parents=True, exist_ok=True)
    out_path.write_text(text, encoding="utf-8")
    print(out_path.relative_to(ROOT).as_posix())

    if not args.no_index:
        link = f"./{out_name}"
        if args.kind == "req":
            row = f"| {day} | [{title}]({link}) | 探索中 | |"
        elif args.kind == "upd":
            row = f"| {day} | [{title}]({link}) | | |"
        else:
            row = f"| {day} | [{title}]({link}) | |"
        prepend_index_row(meta["index"], meta["index_section"], row)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
