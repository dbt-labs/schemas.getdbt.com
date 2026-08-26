"""Remove newline characters from the end of JSON files."""

from __future__ import annotations

import sys
from pathlib import Path


def remove_trailing_newlines(path: Path) -> bool:
    """Remove trailing CR and LF bytes, returning whether the file changed."""
    original = path.read_bytes()
    updated = original.rstrip(b"\r\n")
    if updated == original:
        return False

    path.write_bytes(updated)
    return True


def main(filenames: list[str]) -> int:
    changed = False
    for filename in filenames:
        changed = remove_trailing_newlines(Path(filename)) or changed
    return int(changed)


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
