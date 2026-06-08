import subprocess

stashes = ["stash@{0}", "stash@{1}", "stash@{2}"]
for stash in stashes:
    print(f"Searching {stash}...")
    try:
        out = subprocess.check_output(["git", "grep", "-i", "collage", stash], encoding="utf-8", errors="ignore")
        print(f"Found matches in {stash}:")
        print(out)
    except subprocess.CalledProcessError:
        print(f"No matches in {stash}")
    print("-" * 50)
