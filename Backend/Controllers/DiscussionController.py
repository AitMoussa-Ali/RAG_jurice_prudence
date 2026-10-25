from pathlib import Path
import json
import os
from typing import Literal
MEMORY_PATH = Path(
    os.getenv(
        "DISCUSSIONS_PATH",
        str(Path(__file__).resolve().parents[1] / "Discussions" / "discussions.json"),
    )
)

def load_discussions() -> dict:
    """Load conversations from JSON, creating the file if it doesn't exist."""

    # Create the parent directories if necessary
    MEMORY_PATH.parent.mkdir(parents=True, exist_ok=True)

    # If the file doesn't exist, create it with an empty dictionary
    if not MEMORY_PATH.exists():
        with MEMORY_PATH.open("w", encoding="utf-8") as file:
            json.dump({}, file, ensure_ascii=False, indent=4)

    # If the file exists, return its content
    try:
        with MEMORY_PATH.open("r", encoding="utf-8") as file:
            return json.load(file)
    except (json.JSONDecodeError, OSError) as e:
        raise RuntimeError(
            f"Cannot read conversation memory: {MEMORY_PATH}"
        ) from e

def save_discussions(discussions: dict) -> None:
    MEMORY_PATH.parent.mkdir(parents=True, exist_ok=True)

    with MEMORY_PATH.open("w", encoding="utf-8") as file:
        json.dump(
            discussions,
            file,
            ensure_ascii=False,
            indent=2
        )
