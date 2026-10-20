# Hotfix for package metadata mismatches (e.g. pymatting metadata not found)
try:
    import importlib.metadata
    _orig_metadata = importlib.metadata.metadata
    def _mock_metadata(package_name):
        try:
            return _orig_metadata(package_name)
        except Exception:
            from email.message import Message
            m = Message()
            m.add_header('Version', '1.0.0')
            m.add_header('Name', package_name)
            return m
    importlib.metadata.metadata = _mock_metadata
except Exception:
    pass

try:
    import importlib_metadata
    _orig_metadata_alt = importlib_metadata.metadata
    def _mock_metadata_alt(package_name):
        try:
            return _orig_metadata_alt(package_name)
        except Exception:
            from email.message import Message
            m = Message()
            m.add_header('Version', '1.0.0')
            m.add_header('Name', package_name)
            return m
    importlib_metadata.metadata = _mock_metadata_alt
except Exception:
    pass

import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor

# Redirect rembg model home directory to prevent sandboxed download attempts
if os.environ.get("COSMO_MODELS_DIR"):
    os.environ["U2NET_HOME"] = os.environ.get("COSMO_MODELS_DIR")

# Aggressively limit CPU thread pool sizes — prevents OS-level lockups
os.environ["OMP_NUM_THREADS"] = "2"
os.environ["MKL_NUM_THREADS"] = "2"
os.environ["OPENBLAS_NUM_THREADS"] = "2"
os.environ["VECLIB_MAXIMUM_THREADS"] = "2"
os.environ["NUMEXPR_NUM_THREADS"] = "2"

# Throttling priority on Windows: BELOW_NORMAL_PRIORITY_CLASS (0x00004000)
# Ensures DWM (Desktop Window Manager), mouse cursor, and audio are never starved during AI processing
if sys.platform == 'win32':
    try:
        import ctypes
        ctypes.windll.kernel32.SetPriorityClass(ctypes.windll.kernel32.GetCurrentProcess(), 0x00004000)
    except Exception:
        pass

import base64
import json
import numpy as np
import cv2

# Hotfix for modern torchvision + basicsr conflict
# torchvision 0.15+ removed functional_tensor which causes basicsr imports to crash.
# Injecting a mock module before basicsr is imported solves this cleanly.
try:
    import types
    import torchvision
    if not hasattr(torchvision, 'transforms'):
        import torchvision.transforms
    # Dynamically inject the mock module into sys.modules
    functional_tensor = types.ModuleType("torchvision.transforms.functional_tensor")
    functional_tensor.rgb_to_grayscale = torchvision.transforms.functional.rgb_to_grayscale
    sys.modules["torchvision.transforms.functional_tensor"] = functional_tensor
except Exception as e:
    print(f"Failed to apply functional_tensor hotfix: {e}", file=sys.stderr)


# Restrict OpenCV CPU threads — prevents high-core-count lockups
cv2.setNumThreads(2)

# Single background worker — GPU work is serialised, never concurrent
_gpu_executor = ThreadPoolExecutor(max_workers=1)


gfpganer = None
upscaler = None

def init_models():
    global gfpganer, upscaler
    if gfpganer is not None:
        return
        
    script_dir = os.path.dirname(os.path.abspath(__file__))
    
    # Define candidate directories to look for .cosmo_models
    # Priority: explicit env var > user-writable app dirs > relative paths
    candidates = []
    
    # 1. Explicit override via environment variable (set by Rust backend)
    env_models_dir = os.environ.get("COSMO_MODELS_DIR")
    if env_models_dir:
        candidates.append(env_models_dir)
    
    # 2. User-writable app data directories (works for MSIX installs)
    appdata = os.environ.get("APPDATA")
    localappdata = os.environ.get("LOCALAPPDATA")
    userprofile = os.environ.get("USERPROFILE")
    
    if appdata:
        candidates.append(os.path.join(appdata, "com.cosmo.symphony", ".cosmo_models"))
    if localappdata:
        candidates.append(os.path.join(localappdata, "com.cosmo.symphony", ".cosmo_models"))
    if userprofile:
        candidates.append(os.path.join(userprofile, ".cosmo_models"))
    
    # 3. Script-relative paths (sibling to the executable/script)
    candidates.append(os.path.join(script_dir, ".cosmo_models"))
    
    # 4. Relative traversal paths for dev builds (src-tauri/target/debug -> project root)
    candidates.extend([
        os.path.join(script_dir, "..", "..", "..", "..", ".cosmo_models"),   # src-tauri/target/debug/resources -> Video/
        os.path.join(script_dir, "..", "..", "..", ".cosmo_models"),        # src-tauri/target/debug -> Video/
        os.path.join(script_dir, "..", "..", ".cosmo_models"),              # src-tauri/target -> Video/
        os.path.join(script_dir, "..", ".cosmo_models"),                    # src-tauri -> Video/
    ])
    
    # 5. CWD-relative paths
    candidates.extend([
        os.path.join(os.getcwd(), ".cosmo_models"),
        os.path.join(os.getcwd(), "..", ".cosmo_models"),
    ])
    
    models_dir = None
    upscaler_filename = None
    for cand in candidates:
        cand_norm = os.path.abspath(cand)
        ultra_path = os.path.join(cand_norm, "4x-UltraSharp.pth")
        realesrgan_path = os.path.join(cand_norm, "RealESRGAN_x4plus.pth")
        gfpgan_path = os.path.join(cand_norm, "GFPGANv1.4.pth")
        
        gfp_exists = os.path.exists(gfpgan_path)
        if os.path.exists(ultra_path) and gfp_exists:
            models_dir = cand_norm
            upscaler_filename = "4x-UltraSharp.pth"
            print(f"Candidate matched: {cand_norm} using primary model [4x-UltraSharp.pth]", file=sys.stderr)
            break
        elif os.path.exists(realesrgan_path) and gfp_exists:
            models_dir = cand_norm
            upscaler_filename = "RealESRGAN_x4plus.pth"
            print(f"Candidate matched: {cand_norm} using fallback model [RealESRGAN_x4plus.pth]", file=sys.stderr)
            break
            
    if models_dir is None:
        # Fallback to default path for print error statement
        models_dir = os.path.abspath(os.path.join(script_dir, ".cosmo_models"))
        print(f"Pre-trained weights not found in any candidate directories. Running in fallback filter mode.", file=sys.stderr)
        return
        
    realesrgan_path = os.path.join(models_dir, upscaler_filename or "4x-UltraSharp.pth")
    gfpgan_path = os.path.join(models_dir, "GFPGANv1.4.pth")
        
    try:
        import torch
        torch.set_num_threads(2) # Hard cap CPU threads to avoid background lockup
        from realesrgan import RealESRGANer
        from gfpgan import GFPGANer
        from basicsr.archs.rrdbnet_arch import RRDBNet
        
        device = 'cpu'
        if torch.cuda.is_available():
            device = 'cuda'
        else:
            try:
                import torch_directml
                if torch_directml.is_available():
                    device = torch_directml.device()
            except ImportError:
                pass

        if device == 'cpu':
            print("GPU acceleration not available. Running in fallback filter mode.", file=sys.stderr)
            return
            
        model = RRDBNet(num_in_ch=3, num_out_ch=3, num_feat=64, num_block=23, num_grow_ch=32, scale=4)

        # Dynamically determine tile size based on available VRAM
        gpu_tile = 256
        if device == 'cuda':
            try:
                vram_mb = torch.cuda.get_device_properties(0).total_memory / (1024 * 1024)
                if vram_mb < 4000:
                    gpu_tile = 128
                elif vram_mb < 8000:
                    gpu_tile = 256
                else:
                    gpu_tile = 512
                print(f"Using tile size: {gpu_tile} (total VRAM: {int(vram_mb)} MB)", file=sys.stderr)
            except Exception:
                gpu_tile = 256
        else:
            gpu_tile = 128

        upscaler = RealESRGANer(
            scale=4,
            model_path=realesrgan_path,
            model=model,
            tile=gpu_tile,
            tile_pad=10,
            pre_pad=0,
            half=(device == 'cuda'),   # FP16 for ~2x speed — only supported/stable on CUDA
            device=device
        )
        
        gfpganer = GFPGANer(
            model_path=gfpgan_path,
            upscale=4,
            arch='clean',
            channel_multiplier=2,
            bg_upsampler=upscaler,
            device=device
        )
        print(f"Real-ESRGAN and GFPGAN models warmloaded into GPU ({device}) successfully!")
    except Exception as e:
        print(f"Failed to initialize models: {e}. Running in fallback filter mode.", file=sys.stderr)

def safe_read_image(img_or_bytes):
    img = None
    try:
        from PIL import Image, ImageOps
        if isinstance(img_or_bytes, bytes):
            import io
            pil_img = Image.open(io.BytesIO(img_or_bytes))
        else:
            pil_img = Image.open(img_or_bytes)
        pil_img = ImageOps.exif_transpose(pil_img)
        img = cv2.cvtColor(np.array(pil_img.convert('RGB')), cv2.COLOR_RGB2BGR)
        return img
    except Exception:
        pass

    if isinstance(img_or_bytes, bytes):
        try:
            nparr = np.frombuffer(img_or_bytes, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        except Exception:
            pass
    else:
        try:
            img = cv2.imdecode(np.fromfile(img_or_bytes, dtype=np.uint8), cv2.IMREAD_COLOR)
        except Exception:
            pass
        if img is None:
            try:
                img = cv2.imread(img_or_bytes, cv2.IMREAD_COLOR)
            except Exception:
                pass
    return img

def restore_color(img):
    """
    Adaptive Color & Vibrance Restoration.
    De-fades washed out photos, corrects white balance casts, and boosts natural skin vibrancy.
    """
    try:
        # 1. Simplest color balance: stretch per-channel histogram to eliminate color casts (yellowing/haziness)
        out_channels = []
        num = img.shape[0] * img.shape[1]
        percent = 0.5
        for channel in cv2.split(img):
            flat_sorted = np.sort(channel.flatten())
            low_val = flat_sorted[int(num * percent / 100)]
            high_val = flat_sorted[int(num * (100 - percent) / 100)]
            if high_val > low_val:
                norm = np.clip((channel.astype(np.float32) - low_val) / (high_val - low_val) * 255.0, 0, 255).astype(np.uint8)
            else:
                norm = channel
            out_channels.append(norm)
        bal = cv2.merge(out_channels)
        
        # 2. Local contrast & dynamic range equalization in LAB luminance channel
        lab = cv2.cvtColor(bal, cv2.COLOR_BGR2LAB)
        l, a, b = cv2.split(lab)
        clahe = cv2.createCLAHE(clipLimit=1.6, tileGridSize=(8, 8))
        cl = clahe.apply(l)
        bgr = cv2.cvtColor(cv2.merge((cl, a, b)), cv2.COLOR_LAB2BGR)
        
        # 3. Non-linear vibrance boost (enhances muted colors more than saturated ones)
        hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV).astype(np.float32)
        sat = hsv[:, :, 1]
        hsv[:, :, 1] = np.clip(sat * (1.0 + 0.30 * (1.0 - sat / 255.0)), 0, 255)
        return cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2BGR)
    except Exception as e:
        print(f"Color restoration note: {e}, using original colors", file=sys.stderr)
        return img

def process_enhance(img_or_bytes, fidelity=0.5, restore_faces=True, restore_color_flag=False, outscale=4):
    init_models()
    img = safe_read_image(img_or_bytes)
    if img is None:
        raise ValueError("Could not decode or read the input image.")

    h_in, w_in = img.shape[:2]

    # Handle 1x mode (no 4x scaling, only face + color restoration)
    if outscale == 1:
        restored = img.copy()
        if restore_faces and gfpganer is not None:
            try:
                def _run_face_1x():
                    orig_bg = gfpganer.bg_upsampler
                    orig_scale = gfpganer.upscale
                    gfpganer.bg_upsampler = None
                    gfpganer.upscale = 1
                    try:
                        _, _, r = gfpganer.enhance(restored, has_aligned=False, only_center_face=False, paste_back=True, weight=fidelity)
                        return r
                    finally:
                        gfpganer.bg_upsampler = orig_bg
                        gfpganer.upscale = orig_scale
                restored = _gpu_executor.submit(_run_face_1x).result()
            except Exception as fe:
                print(f"1x face enhancement note: {fe}", file=sys.stderr)

        if restore_color_flag:
            restored = restore_color(restored)
        return restored, True

    # SAFETY GUARDRAIL: Pre-scale large input images BEFORE running 4x neural super-resolution!
    MAX_INPUT_DIM = 1280
    if max(h_in, w_in) > MAX_INPUT_DIM:
        scale_factor = MAX_INPUT_DIM / float(max(h_in, w_in))
        new_in_w = max(1, int(w_in * scale_factor))
        new_in_h = max(1, int(h_in * scale_factor))
        print(f"Safety Pre-scale: Clamping input from {w_in}x{h_in} to {new_in_w}x{new_in_h} (caps 4x output to {new_in_w*4}x{new_in_h*4})", file=sys.stderr)
        img = cv2.resize(img, (new_in_w, new_in_h), interpolation=cv2.INTER_AREA)

    # Run GFPGAN & Real-ESRGAN or Fallback to bilateral unsharp filter.
    if gfpganer is not None:
        try:
            print("Dispatching upscale task to GPU executor...", file=sys.stderr)
            print("Transferring image matrix to GPU VRAM...", file=sys.stderr)
            def _run_gpu():
                if restore_faces:
                    print("Running 4x-UltraSharp + GFPGAN face restoration...", file=sys.stderr)
                    _, _, r = gfpganer.enhance(
                        img,
                        has_aligned=False,
                        only_center_face=False,
                        paste_back=True,
                        weight=fidelity
                    )
                    return r
                else:
                    print("Running 4x-UltraSharp alone...", file=sys.stderr)
                    r, _ = upscaler.enhance(img, outscale=4)
                    return r

            restored_img = _gpu_executor.submit(_run_gpu).result()
            
            if restore_color_flag:
                restored_img = restore_color(restored_img)

            print("GPU Model inference successful! Releasing VRAM back to OS...", file=sys.stderr)
            
            # Release VRAM back to OS immediately
            try:
                import torch
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
            except Exception:
                pass
            
            # Brief yield — lets Windows compositor catch up after heavy GPU load
            time.sleep(0.02)
            return restored_img, True
        except Exception as e:
            print(f"Model inference failed: {e}. Falling back to high-fidelity resize filter.", file=sys.stderr)
            try:
                import torch
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
            except Exception:
                pass
            
    # Resilient high-fidelity CPU fallback:
    smoothed = cv2.bilateralFilter(img, 9, 75, 75)
    gaussian = cv2.GaussianBlur(smoothed, (5, 5), 0)
    unsharp_lowres = cv2.addWeighted(smoothed, 1.5, gaussian, -0.5, 0)
    h, w = img.shape[:2]
    
    target_w = w * 4
    target_h = h * 4
    max_dim = 5120
    if max(target_w, target_h) > max_dim:
        scale = max_dim / float(max(target_w, target_h))
        target_w = int(target_w * scale)
        target_h = int(target_h * scale)
        
    resized = cv2.resize(unsharp_lowres, (target_w, target_h), interpolation=cv2.INTER_CUBIC)
    return resized, False

def texture_aware_inpaint(img, mask, grain_blend=1.0, inpaint_radius=3, method=cv2.INPAINT_TELEA):
    # 1. Perform standard C++ inpainting to get a smooth, base fill
    inpainted = cv2.inpaint(img, mask, inpaintRadius=inpaint_radius, flags=method)
    
    h_img, w_img = img.shape[:2]
    
    # 2. Find contours/bounding boxes of masked regions to process them individually
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return inpainted
        
    for contour in contours:
        x, y, w, h = cv2.boundingRect(contour)
        if w <= 0 or h <= 0:
            continue
            
        # We search for a matching background patch nearby to transfer real texture structure
        # Define a padded region around the contour to match the background transition
        pad = 8
        y1_pad = max(0, y - pad)
        y2_pad = min(h_img, y + h + pad)
        x1_pad = max(0, x - pad)
        x2_pad = min(w_img, x + w + pad)
        
        local_mask_pad = mask[y1_pad:y2_pad, x1_pad:x2_pad]
        bg_weights = (local_mask_pad == 0).astype(np.float32)
        
        # If the background padding is too small, we can't reliably match borders
        if np.sum(bg_weights) < 10:
            continue
            
        target_pad = img[y1_pad:y2_pad, x1_pad:x2_pad].astype(np.float32)
        
        # Grid search for the best nearby patch (Clone Stamp simulation)
        best_dx, best_dy = 0, 0
        min_error = float('inf')
        found_patch = False
        
        # Sample offsets in a ring around the bounding box
        # We search up to 2.5 times the size of the box
        step_y = max(2, h // 4)
        step_x = max(2, w // 4)
        
        for dy in range(-2 * h, 2 * h + 1, step_y):
            for dx in range(-2 * w, 2 * w + 1, step_x):
                # Avoid overlapping significantly with the watermark mask
                if abs(dx) < w and abs(dy) < h:
                    continue
                    
                cy1 = y1_pad + dy
                cy2 = y2_pad + dy
                cx1 = x1_pad + dx
                cx2 = x2_pad + dx
                
                if cy1 < 0 or cy2 > h_img or cx1 < 0 or cx2 > w_img:
                    continue
                    
                # Candidate patch must not contain any masked pixels itself!
                cand_mask = mask[cy1:cy2, cx1:cx2]
                if np.any(cand_mask > 0):
                    continue
                    
                cand_pad = img[cy1:cy2, cx1:cx2].astype(np.float32)
                
                # Compute MSE on the surrounding unmasked border pixels
                diff = (cand_pad - target_pad) * bg_weights[:, :, np.newaxis]
                error = np.sum(diff ** 2) / (np.sum(bg_weights) * 3 + 1e-5)
                
                if error < min_error:
                    min_error = error
                    best_dx, best_dy = dx, dy
                    found_patch = True
                    
        # If a matching texture patch is found with high confidence
        if found_patch and min_error < 1500.0:  # Threshold for a reasonable match
            best_cand_core = img[y+best_dy : y+best_dy+h, x+best_dx : x+best_dx+w]
            
            contour_mask = mask[y:y+h, x:x+w]
            
            # Feather the contour mask gently for seamless blending
            ksize = 5
            if h < ksize or w < ksize:
                ksize = min(h, w)
                if ksize % 2 == 0:
                    ksize -= 1
                if ksize < 1:
                    ksize = 1
                    
            if ksize >= 3:
                feathered_mask = cv2.GaussianBlur(contour_mask.astype(np.float32) / 255.0, (ksize, ksize), 0)
            else:
                feathered_mask = contour_mask.astype(np.float32) / 255.0
                
            feathered_3ch = np.stack([feathered_mask] * 3, axis=-1)
            
            roi_inpainted = inpainted[y:y+h, x:x+w].astype(np.float32)
            cand_core_float = best_cand_core.astype(np.float32)
            
            # Blend the real texture patch onto the smooth inpainted region
            blended = cand_core_float * feathered_3ch + roi_inpainted * (1.0 - feathered_3ch)
            inpainted[y:y+h, x:x+w] = np.clip(blended, 0, 255).astype(np.uint8)
            
        else:
            # Fallback: Synthesize local texture noise/grain if no matching structural patch is found
            pad_local = 15
            y1 = max(0, y - pad_local)
            y2 = min(h_img, y + h + pad_local)
            x1 = max(0, x - pad_local)
            x2 = min(w_img, x + w + pad_local)
            
            local_mask = mask[y1:y2, x1:x2]
            
            # We compute local high-frequency noise from surrounding pixels
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            blurred = cv2.GaussianBlur(gray, (3, 3), 0)
            high_freq = cv2.absdiff(gray, blurred)
            
            local_high_freq = high_freq[y1:y2, x1:x2]
            surrounding_pixels = local_high_freq[local_mask == 0]
            
            if surrounding_pixels.size > 10:
                std_dev = np.std(surrounding_pixels)
                if std_dev > 0.5:
                    noise = np.random.normal(0, std_dev * 0.8 * grain_blend, (h, w))
                    noise_3ch = np.stack([noise] * 3, axis=-1).astype(np.float32)
                    
                    contour_mask = mask[y:y+h, x:x+w]
                    ksize = 5
                    if h < ksize or w < ksize:
                        ksize = min(h, w)
                        if ksize % 2 == 0:
                            ksize -= 1
                        if ksize < 1:
                            ksize = 1
                            
                    if ksize >= 3:
                        feathered_mask = cv2.GaussianBlur(contour_mask.astype(np.float32) / 255.0, (ksize, ksize), 0)
                    else:
                        feathered_mask = contour_mask.astype(np.float32) / 255.0
                        
                    feathered_3ch = np.stack([feathered_mask] * 3, axis=-1)
                    
                    roi_inpainted = inpainted[y:y+h, x:x+w].astype(np.float32)
                    roi_inpainted += noise_3ch * feathered_3ch
                    inpainted[y:y+h, x:x+w] = np.clip(roi_inpainted, 0, 255).astype(np.uint8)
                    
    return inpainted

