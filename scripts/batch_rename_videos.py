# =============================================
# Isabel Video Renamer
#
# Purpose:
#   Batch-rename all video AND image files in a
#   chosen directory to a clean sequential pattern:
#       Isabel_001.mp4, Isabel_002.jpg, etc.
#   The original filename is stripped completely.
#
# How to run:
#   1. Install dependency:  pip install send2trash
#   2. Run:  python batch_rename_videos.py
#   3. Enter the target folder path when prompted
#   4. Optionally change the prefix (default: Isabel)
#   5. Review the dry-run preview
#   6. Type 'y' to confirm and rename for real
#
# Duplicate filenames:
#   Before renaming a file to a name that already
#   exists on disk, the EXISTING file is moved to
#   the Recycle Bin via send2trash. Nothing is ever
#   permanently deleted — you can always restore
#   from the Recycle Bin.
#
# Where old files go:
#   Recycle Bin (Windows) / Trash (macOS/Linux)
#   Right-click Recycle Bin → "Restore" to recover.
#
# Naming format:
#   {Prefix}_{NNN}.{ext}
#   e.g. Isabel_001.mp4, Isabel_002.jpg
#   • Underscore separator — always present
#   • Three-digit zero-padded number (001–999)
#   • Original filename is completely discarded
#
# Sequence detection:
#   Scans the folder for ANY file matching the
#   pattern {Prefix}_###.* (any extension) to find
#   the highest existing number, then continues
#   from that number + 1.
#
# Supported extensions:
#   Video: .mp4 .mov .avi .mkv .wmv .flv .webm .m4v .ts .mts
#   Image: .jpg .jpeg .png .gif .bmp .webp .tiff .tif .heic
# =============================================

import os
import re
import sys

# ── Recycle Bin support ─────────────────────────────────────────────────────
# send2trash moves files to the OS Recycle Bin instead of permanently
# deleting them. This is the safety net for the entire script.
try:
    from send2trash import send2trash
except ImportError:
    print("ERROR: 'send2trash' package is required for Recycle Bin support.")
    print("       Install it with:  pip install send2trash")
    sys.exit(1)


# ── Configuration ───────────────────────────────────────────────────────────
# All file types eligible for renaming.
SUPPORTED_EXTENSIONS = {
    # Video
    ".mp4", ".mov", ".avi", ".mkv", ".wmv",
    ".flv", ".webm", ".m4v", ".ts", ".mts",
    # Image
    ".jpg", ".jpeg", ".png", ".gif", ".bmp",
    ".webp", ".tiff", ".tif", ".heic",
}

# Default naming prefix — can be overridden at the interactive prompt.
DEFAULT_PREFIX = "Isabel"


# ── Helpers ─────────────────────────────────────────────────────────────────

def is_supported_file(filename: str) -> bool:
    """Check if a filename has one of our supported extensions."""
    _, ext = os.path.splitext(filename)
    return ext.lower() in SUPPORTED_EXTENSIONS


def find_highest_existing_number(directory: str, prefix: str) -> int:
    """
    Scan the ENTIRE directory for files matching {prefix}_###.{any ext}
    and return the highest ### found.

    This looks at ALL files (not just videos/images) so we never collide
    with any existing numbered file.

    Examples that match:
        Isabel_001.mp4  →  1
        Isabel_042.jpg  →  42
        Isabel_999.png  →  999

    Returns 0 if no matching files exist, so numbering starts at 001.
    """
    # Match: Isabel_001.anything — captures the digits after the underscore
    pattern = re.compile(
        rf"^{re.escape(prefix)}_(\d{{3,}})\..",
        re.IGNORECASE,
    )

    highest = 0

    # Walk every file in the directory looking for matches
    for entry in os.scandir(directory):
        if not entry.is_file():
            continue
        match = pattern.match(entry.name)
        if match:
            num = int(match.group(1))       # extract the number portion
            if num > highest:
                highest = num               # track the maximum

    return highest


def build_rename_plan(
    directory: str,
    prefix: str,
) -> list[tuple[str, str]]:
    """
    Build an ordered list of (old_path, new_path) rename operations.

    Steps:
      1. Collect all supported files that do NOT already match the pattern
      2. Sort them alphabetically for deterministic ordering
      3. Find the highest existing sequence number in the folder
      4. Assign new names: {prefix}_{NNN}.{ext}  (underscore + 3 digits)
    """
    # ── Step 1: Identify files already matching our pattern ─────────────
    # Files like Isabel_001.mp4 are skipped so running the script
    # twice doesn't re-rename them or shift numbers around.
    already_pattern = re.compile(
        rf"^{re.escape(prefix)}_\d{{3,}}\.",
        re.IGNORECASE,
    )

    candidates: list[str] = []
    for entry in os.scandir(directory):
        if entry.is_file() and is_supported_file(entry.name):
            # Skip files that already have our naming pattern
            if already_pattern.match(entry.name):
                continue
            candidates.append(entry.name)

    # ── Step 2: Sort so the order is always predictable ─────────────────
    candidates.sort()

    # ── Step 3: Find the highest existing number ────────────────────────
    # Scans ALL files in the folder matching Isabel_###.*
    # If Isabel_007.jpg exists, we start at 008.
    start = find_highest_existing_number(directory, prefix) + 1

    # ── Step 4: Assign new names with underscore + 3-digit padding ──────
    plan: list[tuple[str, str]] = []
    for i, old_name in enumerate(candidates):
        _, ext = os.path.splitext(old_name)
        seq = start + i

        # THE KEY LINE: prefix + underscore + 3-digit zero-padded number
        # e.g. "Isabel" + "_" + "001" + ".jpg" = "Isabel_001.jpg"
        new_name = f"{prefix}_{seq:03d}{ext.lower()}"

        plan.append((
            os.path.join(directory, old_name),
            os.path.join(directory, new_name),
        ))

    return plan


def execute_rename(
    plan: list[tuple[str, str]],
    dry_run: bool = True,
) -> None:
    """
    Execute (or preview) the rename plan.

    dry_run=True  → prints what WOULD happen, touches nothing
    dry_run=False → actually renames files on disk

    RECYCLE BIN SAFETY:
    If the new filename already exists on disk, the existing file
    is sent to the Recycle Bin via send2trash BEFORE the rename.
    This ensures nothing is permanently lost.
    """
    if not plan:
        print("\n  Nothing to rename — no eligible files found.")
        return

    mode_label = "DRY RUN" if dry_run else "LIVE"
    mode_desc = "preview only" if dry_run else "renaming on disk"
    print(f"\n  ── {mode_label} ({mode_desc}) ──\n")

    for old_path, new_path in plan:
        old_name = os.path.basename(old_path)
        new_name = os.path.basename(new_path)
        print(f"    {old_name}  →  {new_name}")

        if not dry_run:
            # ── RECYCLE BIN CHECK ───────────────────────────────────────
            # If a file with the target name already exists, send it to
            # the Recycle Bin first. This is the core safety mechanism —
            # the user can always recover it via Restore.
            if os.path.exists(new_path):
                print(f"      ⚠  {new_name} already exists — moving to Recycle Bin")
                send2trash(new_path)

            # ── RENAME ──────────────────────────────────────────────────
            # Now it's safe — the target name is guaranteed to be free.
            os.rename(old_path, new_path)

    status = "would be" if dry_run else "successfully"
    print(f"\n  ✓ {len(plan)} file(s) {status} renamed.\n")


# ── Interactive entry-point ─────────────────────────────────────────────────

def main() -> None:
    print()
    print("  ╔══════════════════════════════════════════╗")
    print("  ║   BATCH VIDEO RENAMER  ·  Recycle-Safe   ║")
    print("  ╚══════════════════════════════════════════╝")
    print()

    # ── Ask for target directory ────────────────────────────────────────
    target_dir = input("  Target directory: ").strip().strip('"')
    if not os.path.isdir(target_dir):
        print(f"  ERROR: '{target_dir}' is not a valid directory.")
        sys.exit(1)

    # ── Ask for prefix (press Enter to keep default) ────────────────────
    prefix_input = input(f"  Naming prefix [{DEFAULT_PREFIX}]: ").strip()
    prefix = prefix_input if prefix_input else DEFAULT_PREFIX

    # ── Build the rename plan ───────────────────────────────────────────
    plan = build_rename_plan(target_dir, prefix)

    # ── Always show dry run first ───────────────────────────────────────
    # Lets the user see exactly what will happen before confirming.
    execute_rename(plan, dry_run=True)

    if not plan:
        return

    # ── Confirm before touching anything ────────────────────────────────
    confirm = input("  Proceed with rename? (y/N): ").strip().lower()
    if confirm not in ("y", "yes"):
        print("  Aborted — no files were changed.\n")
        return

    # ── Execute for real ────────────────────────────────────────────────
    execute_rename(plan, dry_run=False)


if __name__ == "__main__":
    main()
