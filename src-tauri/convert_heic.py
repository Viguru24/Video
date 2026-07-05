import sys
import os
from PIL import Image
from pillow_heif import register_heif_opener

def convert_heic(src_path, dest_path):
    register_heif_opener()
    try:
        image = Image.open(src_path)
        ext = os.path.splitext(dest_path)[1].lower()
        if ext in ['.jpg', '.jpeg']:
            # Convert to RGB mode first if image is RGBA (JPEG doesn't support alpha channel)
            if image.mode in ('RGBA', 'LA') or (image.mode == 'P' and 'transparency' in image.info):
                image = image.convert('RGB')
            image.save(dest_path, "JPEG", quality=95)
        else:
            image.save(dest_path, "PNG")
        print(f"SUCCESS: Converted {src_path} to {dest_path}")
        return True
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return False

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: convert_heic.py <src_path> <dest_path>")
        sys.exit(1)
    
    src = sys.argv[1]
    dest = sys.argv[2]
    
    if convert_heic(src, dest):
        sys.exit(0)
    else:
        sys.exit(1)
