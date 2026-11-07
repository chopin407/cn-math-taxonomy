"""Extract the grade7-math-main question banks without running source JavaScript."""

import argparse
from collections import Counter
import json
from pathlib import Path
import re


ROOT = Path(__file__).resolve().parent.parent
SOURCE_BANKS = {
    "textbookExamples": "教材例题",
    "questions": "分层练习",
    "zhongkao": "中考题",
    "yuekao": "月考及期中期末题",
    "extension": "拓展题",
}
WRAPPER = re.compile(
    r"\s*(?:/\*.*?\*/\s*)?window\.CHAPTERS = window\.CHAPTERS \|\| \[\];\s*"
    r"window\.CHAPTERS\.push\((\{.*\})\);\s*", re.DOTALL
)
TOKENS = re.compile(
    r'"(?:[^"\\]|\\.)*"|/\*.*?\*/|//[^\n]*|\b([A-Za-z_]\w*)\s*:|,(?=\s*[}\]])', re.DOTALL
)
# 源小节与图谱小节编号不一致时，按内容对照。
SECTION_OVERRIDES = {
    "u1-2": ("1.2.1",),
    "u1-3": ("1.2.2", "1.2.5"),
    "u1-4": ("1.2.3", "1.2.4"),
    "u2-4": ("cnm_021", "2.3.2"),
    "u7-1": ("7.1.1", "7.1.2"),
    "u7-2": ("7.1.3", "7.2.1", "7.2.2"),
    "u7-3": ("7.2.3", "cnm_065"),
    "u7-4": ("7.3", "7.4"),
    "u12-2": ("12.2", "cnm_299"),
}
REVIEW_NOTES = {
    "ch04/u4-1/textbookExamples/0": "第③小题原解析有误。πr² 的系数是 π，r 的指数是 2，所以次数是 2。",
    "ch04/u4-1/questions/0": "πr² 的系数是 π，次数是 2。原解析把次数写成了 1。",
    "ch07/u7-1/textbookExamples/0": "原资料未附图，OE 可能在 OB 与 OD 夹角的两侧，角度可为 40° 或 140°。",
    "ch07/u7-1/questions/4": "原资料未附图。OC、OD 在 AB 同侧时为 85°，异侧时为 165°。",
    "ch07/u7-2/questions/4": "原资料未附图，∠1、∠3 的位置请结合原图复核。",
    "ch07/u7-3/textbookExamples/0": "题干将折线描述为同一条截线，与所给内错角角度冲突，请复核原图。",
}


def as_json(match):
    if match[1] is not None:
        return json.dumps(match[1]) + ":"
    return match[0] if match[0].startswith('"') else ""


def read_chapter(path):
    match = WRAPPER.fullmatch(path.read_text(encoding="utf-8-sig"))
    if match is None:
        raise ValueError(f"Unrecognized chapter wrapper: {path}")
    return json.loads(TOKENS.sub(as_json, match[1]))


def extract(source, topics):
    chapters = []
    for number in range(1, 13):
        chapter_id = f"ch{number:02}"
        chapter = read_chapter(source / "data" / f"{chapter_id}.js")
        if chapter["id"] != chapter_id:
            raise ValueError(f"Unexpected chapter id: {chapter['id']}")
        volume = chapter["volume"]
        prefix = f"七{volume[0]} 第{chapter['no']}章 {chapter['title']} "
        chapter_topics = [
            (topic, topic["chapter"][len(prefix):])
            for topic in topics
            if topic["grade"] == 7 and re.fullmatch(r"cnm_\d+", topic["id"])
            and topic["chapter"].startswith(prefix)
        ]
        units = []
        for unit in chapter["units"]:
            unit_id = unit["id"]
            sections = SECTION_OVERRIDES.get(unit_id, (unit["title"].split()[0],))
            links = [
                {"id": topic["id"], "name": topic["name"]}
                for topic, section in chapter_topics
                if any(s == topic["id"] or section == s or section.startswith((s + ".", s + "/"))
                       or s in section.split("/") for s in sections)
            ]
            if not links:
                raise ValueError(f"No curriculum links for {unit_id}")
            questions = []
            for key, rows in unit.items():
                if key not in SOURCE_BANKS:
                    items = rows if isinstance(rows, list) else [rows]
                    if any(isinstance(item, dict) and "q" in item for item in items):
                        raise ValueError(f"Unrecognized question bank: {unit_id}/{key}")
            for key in SOURCE_BANKS:
                for index, row in enumerate(unit.get(key, [])):
                    if set(row) - {"q", "steps", "ans", "diff", "src", "tip", "note"}:
                        raise ValueError(f"Unrecognized question fields: {unit_id}/{key}/{index}")
                    qid = f"{chapter_id}/{unit_id}/{key}/{index}"
                    questions.append({
                        "id": qid,
                        "kind": key,
                        "prompt": row["q"],
                        "steps": row["steps"] if key == "textbookExamples" else row["ans"],
                        **{dest: row[field] for field, dest in
                           (("diff", "difficulty"), ("src", "sourceLabel"), ("tip", "tip"), ("note", "tip"))
                           if field in row},
                        **({"reviewNote": REVIEW_NOTES[qid]} if qid in REVIEW_NOTES else {}),
                    })
            units.append({"id": unit_id, "title": unit["title"], "topics": links, "questions": questions})
        chapters.append({"id": chapter_id, "title": f"第{chapter['no']}章 {chapter['title']}", "volume": volume, "units": units})
    return {"source": "grade7-math-main", "kinds": SOURCE_BANKS, "chapters": chapters}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="Path to the grade7-math-main directory")
    parser.add_argument("--check", action="store_true", help="Compare the extraction with the checked-in bank")
    args = parser.parse_args()
    topics = json.loads((ROOT / "data/topics.json").read_text(encoding="utf-8"))
    bank = extract(args.source, topics)
    output = ROOT / "data/grade7-questions.json"
    if args.check:
        if json.loads(output.read_text(encoding="utf-8")) != bank:
            raise SystemExit("The extracted questions differ from data/grade7-questions.json")
    else:
        with output.open("w", encoding="utf-8", newline="\n") as file:
            json.dump(bank, file, ensure_ascii=False, indent=2)
            file.write("\n")
    counts = Counter(q["kind"] for c in bank["chapters"] for u in c["units"] for q in u["questions"])
    print(f"{sum(counts.values())} questions: {dict(counts)}")


if __name__ == "__main__":
    main()
