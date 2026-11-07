"""Validate and package the public files for the LAN deployment."""

import argparse
import io
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile


ROOT = Path(__file__).resolve().parent.parent
PAGES = ("assets", "explore", "diagnose", "children", "practice")
WEB_TYPES = {".html", ".js", ".css", ".png", ".svg", ".ico", ".jpg", ".jpeg", ".webp", ".woff", ".woff2"}
ROOT_FILES = ("index.html", "manifest.webmanifest", "sw.js", "LICENSE")
DATA_FILES = (
    "topics.json", "dependencies.json", "cn-curriculum-standards.json", "questions.json",
    "grade7-questions.json", "id-aliases.json",
)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path, nargs="?", default=ROOT / "dist/kid-learn.tar.gz")
    args = parser.parse_args()
    subprocess.run([sys.executable, "-X", "utf8", "scripts/validate.py"], cwd=ROOT, check=True)
    subprocess.run(["node", "tests/test_practice.js"], cwd=ROOT, check=True)

    files = [ROOT / name for name in ROOT_FILES]
    files += [ROOT / "data" / name for name in DATA_FILES]
    for name in PAGES:
        directory = ROOT / name
        if not directory.is_dir():
            raise FileNotFoundError(directory)
        files += sorted(
            file for file in directory.rglob("*")
            if file.is_file() and not any(part.startswith(".") for part in file.relative_to(ROOT).parts)
            and (file.suffix in WEB_TYPES or file.name.startswith("LICENSE-"))
        )

    output = args.output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=output.parent, suffix=".tmp", delete=False) as file:
        temp = Path(file.name)
    try:
        with tarfile.open(temp, "w:gz") as package:
            for file in files:
                if not file.is_file() or file.resolve() != file:
                    raise ValueError(f"Expected a regular project file: {file}")
                name = file.relative_to(ROOT).as_posix()
                if name == "assets/stats-config.js":
                    data = b"window.CNM_STATS = {};\n"
                    entry = tarfile.TarInfo(name)
                    entry.size = len(data)
                    package.addfile(entry, io.BytesIO(data))
                else:
                    package.add(file, arcname=name)
        temp.replace(output)
    finally:
        temp.unlink(missing_ok=True)
    print(f"Built {output} ({output.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
