import csv
import html
import io
import re


def render_result_content(markdown: str) -> str:
    blocks = _parse_blocks(markdown)
    parts: list[str] = []
    paragraph: list[str] = []

    def flush_paragraph() -> None:
        if paragraph:
            parts.append(f"<p>{'<br />'.join(_inline(value) for value in paragraph)}</p>")
            paragraph.clear()

    for block in blocks:
        kind = block["kind"]
        if kind == "blank":
            flush_paragraph()
        elif kind == "hr":
            flush_paragraph()
            parts.append("<hr />")
        elif kind == "heading":
            flush_paragraph()
            level = min(max(block["level"], 2), 4)
            parts.append(f"<h{level}>{_inline(block['text'])}</h{level}>")
        elif kind == "table":
            flush_paragraph()
            parts.append(_table_html(block["rows"]))
        else:
            paragraph.append(block["text"])

    flush_paragraph()
    return "\n".join(parts)


def result_tables_to_csv(markdown: str) -> str:
    output = io.StringIO()
    writer = csv.writer(output, lineterminator="\n")
    current_heading = ""
    wrote_any = False

    for block in _parse_blocks(markdown):
        if block["kind"] == "heading":
            current_heading = _plain_text(block["text"])
            continue
        if block["kind"] != "table":
            continue
        if current_heading:
            writer.writerow([current_heading])
        for row in block["rows"]:
            writer.writerow([_plain_text(cell) for cell in row])
        writer.writerow([])
        wrote_any = True

    return ("\ufeff" + output.getvalue()) if wrote_any else ""


def _parse_blocks(markdown: str) -> list[dict]:
    lines = markdown.splitlines()
    blocks: list[dict] = []
    index = 0
    while index < len(lines):
        line = lines[index].strip()
        if not line:
            blocks.append({"kind": "blank"})
            index += 1
            continue

        heading = re.match(r"^(#{1,6})\s+(.+)$", line)
        if heading:
            blocks.append({"kind": "heading", "level": len(heading.group(1)), "text": heading.group(2)})
            index += 1
            continue

        if re.fullmatch(r"-{3,}", line):
            blocks.append({"kind": "hr"})
            index += 1
            continue

        if _looks_like_table_start(lines, index):
            rows = [_split_table_row(lines[index])]
            index += 2
            while index < len(lines) and lines[index].strip().startswith("|"):
                rows.append(_split_table_row(lines[index]))
                index += 1
            blocks.append({"kind": "table", "rows": rows})
            continue

        blocks.append({"kind": "text", "text": line})
        index += 1

    return blocks


def _looks_like_table_start(lines: list[str], index: int) -> bool:
    if index + 1 >= len(lines):
        return False
    first = lines[index].strip()
    second = lines[index + 1].strip()
    return first.startswith("|") and second.startswith("|") and _is_separator_row(second)


def _is_separator_row(line: str) -> bool:
    cells = _split_table_row(line)
    return bool(cells) and all(re.fullmatch(r":?-{3,}:?", cell.strip()) for cell in cells)


def _split_table_row(line: str) -> list[str]:
    value = line.strip()
    if value.startswith("|"):
        value = value[1:]
    if value.endswith("|"):
        value = value[:-1]
    return [cell.strip() for cell in value.split("|")]


def _table_html(rows: list[list[str]]) -> str:
    if not rows:
        return ""
    header, body = rows[0], rows[1:]
    header_html = "".join(f"<th>{_inline(cell)}</th>" for cell in header)
    body_html = "\n".join(
        "<tr>" + "".join(f"<td>{_inline(cell)}</td>" for cell in row) + "</tr>"
        for row in body
    )
    return (
        '<div class="server-result-table-wrap"><table class="server-result-table">'
        f"<thead><tr>{header_html}</tr></thead>"
        f"<tbody>{body_html}</tbody>"
        "</table></div>"
    )


def _inline(text: str) -> str:
    pieces = re.split(r"(\*\*[^*]+\*\*)", text)
    rendered = []
    for piece in pieces:
        if piece.startswith("**") and piece.endswith("**"):
            rendered.append(f"<strong>{_escape_inline(piece[2:-2])}</strong>")
        else:
            rendered.append(_escape_inline(piece))
    return "".join(rendered)


def _plain_text(text: str) -> str:
    clean = re.sub(r"(?i)<br\s*/?>", " ", text)
    return re.sub(r"\*\*([^*]+)\*\*", r"\1", clean).strip()


def _escape_inline(text: str) -> str:
    escaped = html.escape(text)
    return re.sub(r"(?i)&lt;br\s*/?&gt;", "<br />", escaped)
