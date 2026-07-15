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

from http.server import HTTPServer, BaseHTTPRequestHandler

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
    for cand in candidates:
        cand_norm = os.path.abspath(cand)
        realesrgan_path = os.path.join(cand_norm, "RealESRGAN_x4plus.pth")
        gfpgan_path = os.path.join(cand_norm, "GFPGANv1.4.pth")
        re_exists = os.path.exists(realesrgan_path)
        gfp_exists = os.path.exists(gfpgan_path)
        print(f"Checking candidate: {cand_norm} (realesrgan_exists={re_exists}, gfpgan_exists={gfp_exists})", file=sys.stderr)
        if re_exists and gfp_exists:
            models_dir = cand_norm
            break
            
    if models_dir is None:
        # Fallback to default path for print error statement
        models_dir = os.path.abspath(os.path.join(script_dir, ".cosmo_models"))
        print(f"Pre-trained weights not found in any candidate directories. Running in fallback filter mode.", file=sys.stderr)
        return
        
    realesrgan_path = os.path.join(models_dir, "RealESRGAN_x4plus.pth")
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

        # Use a conservative tile size of 128 to prevent VRAM memory allocation overhead crashes/freezes on laptop GPUs
        gpu_tile = 128
        print(f"Using conservative tile size: {gpu_tile} for model inference", file=sys.stderr)

        upscaler = RealESRGANer(
            scale=4,
            model_path=realesrgan_path,
            model=model,
            tile=gpu_tile,
            tile_pad=10,
            pre_pad=0,
            half=(device == 'cuda'),   # FP16 FP16 for ~2x speed — only supported/stable on CUDA
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
    if isinstance(img_or_bytes, bytes):
        try:
            nparr = np.frombuffer(img_or_bytes, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        except Exception:
            pass
        if img is None:
            try:
                import io
                from PIL import Image
                pil_img = Image.open(io.BytesIO(img_or_bytes)).convert('RGB')
                img = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)
            except Exception:
                pass
    else:
        try:
            # It's a file path string! Safe unicode reading on Windows
            img = cv2.imdecode(np.fromfile(img_or_bytes, dtype=np.uint8), cv2.IMREAD_COLOR)
        except Exception:
            pass
        if img is None:
            try:
                img = cv2.imread(img_or_bytes, cv2.IMREAD_COLOR)
            except Exception:
                pass
        if img is None:
            try:
                from PIL import Image
                pil_img = Image.open(img_or_bytes).convert('RGB')
                img = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)
            except Exception:
                pass
    return img

def process_enhance(img_or_bytes, fidelity=0.5):
    init_models()
    img = safe_read_image(img_or_bytes)
    if img is None:
        raise ValueError("Could not decode or read the input image.")
        
    # Run GFPGAN & Real-ESRGAN or Fallback to bilateral unsharp filter.
    # GPU work is dispatched to _gpu_executor (background thread) so the HTTP
    # server event loop is never blocked and Windows driver heartbeats continue.
    if gfpganer is not None:
        try:
            print("Dispatching upscale task to GPU executor...", file=sys.stderr)
            print("Transferring image matrix to GPU VRAM...", file=sys.stderr)
            def _run_gpu():
                print("Running Real-ESRGAN model inference...", file=sys.stderr)
                return gfpganer.enhance(
                    img,
                    has_aligned=False,
                    only_center_face=False,
                    paste_back=True,
                    weight=fidelity
                )
            _, _, restored_img = _gpu_executor.submit(_run_gpu).result()
            print("GPU Model inference successful! Releasing VRAM back to OS...", file=sys.stderr)
            # Release VRAM back to OS immediately
            import torch
            torch.cuda.empty_cache()
            
            # Capping maximum resolution to 4K max (3840x2160) to prevent oversized files
            h_out, w_out = restored_img.shape[:2]
            max_width = 3840
            max_height = 2160
            if w_out > max_width or h_out > max_height:
                scale = min(max_width / w_out, max_height / h_out)
                new_w = int(w_out * scale)
                new_h = int(h_out * scale)
                restored_img = cv2.resize(restored_img, (new_w, new_h), interpolation=cv2.INTER_AREA)
                print(f"Downscaled upscaled image from {w_out}x{h_out} to {new_w}x{new_h} (max 4K cap)", file=sys.stderr)

            # Brief yield — lets Windows compositor catch up after heavy GPU load
            time.sleep(0.05)
            return restored_img, True
        except Exception as e:
            print(f"Model inference failed: {e}. Falling back to high-fidelity resize filter.", file=sys.stderr)
            
    # Resilient high-fidelity CPU fallback:
    smoothed = cv2.bilateralFilter(img, 9, 75, 75)
    gaussian = cv2.GaussianBlur(smoothed, (5, 5), 0)
    unsharp_lowres = cv2.addWeighted(smoothed, 1.5, gaussian, -0.5, 0)
    h, w = img.shape[:2]
    
    # Cap CPU fallback to 4K as well!
    target_w = w * 4
    target_h = h * 4
    max_width = 3840
    max_height = 2160
    if target_w > max_width or target_h > max_height:
        scale = min(max_width / target_w, max_height / target_h)
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

class EnhanceHandler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        # Enable CORS!
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_POST(self):
        if self.path == '/enhance':
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                post_data = self.rfile.read(content_length)
                payload = json.loads(post_data.decode('utf-8'))
                
                fidelity = float(payload.get('fidelity', 0.5))
                
                # Check if direct file path is requested
                if 'path' in payload:
                    img_path = payload['path']
                    # Process image from path
                    enhanced_img, used_ai = process_enhance(img_path, fidelity=fidelity)
                    
                    # Resolve output path
                    if 'output_path' in payload:
                        out_path = payload['output_path']
                    else:
                        ext_idx = img_path.rfind('.')
                        if ext_idx != -1:
                            out_path = img_path[:ext_idx] + '_upscaled' + img_path[ext_idx:]
                        else:
                            out_path = img_path + '_upscaled.png'
                            
                    # Save image safely supporting Unicode paths with optimal compression
                    _, ext = os.path.splitext(out_path)
                    ext_lower = ext.lower() if ext else '.png'
                    params = []
                    if ext_lower in ['.jpg', '.jpeg']:
                        params = [cv2.IMWRITE_JPEG_QUALITY, 85]
                    elif ext_lower == '.png':
                        params = [cv2.IMWRITE_PNG_COMPRESSION, 6]
                    elif ext_lower == '.webp':
                        # Limit to standard quality parameter to avoid OpenCV-WebP lossless assertion failures
                        params = [cv2.IMWRITE_WEBP_QUALITY, 80]

                    print(f"Encoding upscaled image to {ext_lower}...", file=sys.stderr)
                    success = False
                    try:
                        success, encoded_img = cv2.imencode(ext_lower, enhanced_img, params)
                    except Exception as enc_err:
                        print(f"Warning: Primary encode failed ({enc_err}). Falling back to PNG...", file=sys.stderr)
                        
                    if not success or encoded_img is None:
                        print("WebP/JPEG encoding failed. Falling back to PNG format...", file=sys.stderr)
                        ext_lower = '.png'
                        out_path = os.path.splitext(out_path)[0] + '.png'
                        params = [cv2.IMWRITE_PNG_COMPRESSION, 6]
                        success, encoded_img = cv2.imencode(ext_lower, enhanced_img, params)

                    if not success or encoded_img is None:
                        raise ValueError("Failed to encode upscaled image for saving")
                        
                    print(f"Saving final image to {out_path}...", file=sys.stderr)
                    encoded_img.tofile(out_path)
                    response_data = {
                        'status': 'success',
                        'path': out_path,
                        'used_ai': used_ai
                    }
                elif 'image' in payload:
                    img_b64 = payload['image']
                    img_bytes = base64.b64decode(img_b64)
                    
                    # Process bytes
                    enhanced_img, used_ai = process_enhance(img_bytes, fidelity=fidelity)
                    
                    # Encode back to base64
                    success, encoded_img = cv2.imencode('.png', enhanced_img, [cv2.IMWRITE_PNG_COMPRESSION, 6])
                    if not success:
                        raise ValueError("Failed to encode upscaled image to PNG")
                        
                    out_b64 = base64.b64encode(encoded_img.tobytes()).decode('utf-8')
                    response_data = {
                        'status': 'success',
                        'image': out_b64,
                        'used_ai': used_ai
                    }
                else:
                    response_data = {'error': 'Missing "image" or "path" in payload'}
                    self.send_response(400)
                    self.send_header('Content-Type', 'application/json')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(json.dumps(response_data).encode('utf-8'))
                    return
                
                # Success response
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps(response_data).encode('utf-8'))
                
            except Exception as e:
                # Error response
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({'error': str(e)}).encode('utf-8'))
        elif self.path == '/inpaint':
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                post_data = self.rfile.read(content_length)
                payload = json.loads(post_data.decode('utf-8'))
                
                img_path = payload['path']
                rect_x = float(payload['rect_x'])
                rect_y = float(payload['rect_y'])
                rect_w = float(payload['rect_w'])
                rect_h = float(payload['rect_h'])
                width_disp = float(payload['width_disp'])
                height_disp = float(payload['height_disp'])
                
                smart_mode = payload.get('smart_mode', True)
                grain_blend = float(payload.get('grain_blend', 1.0))
                
                # Safe unicode read on Windows
                img = safe_read_image(img_path)
                if img is None:
                    raise ValueError(f"Could not load image from: {img_path}")
                    
                img_h, img_w = img.shape[:2]
                
                # Scale from display dimensions to original image dimensions
                scale_x = img_w / width_disp
                scale_y = img_h / height_disp
                
                rx = int(rect_x * scale_x)
                ry = int(rect_y * scale_y)
                rw = int(rect_w * scale_x)
                rh = int(rect_h * scale_y)
                
                # Clamp coordinates to image boundaries
                rx = max(0, min(rx, img_w - 1))
                ry = max(0, min(ry, img_h - 1))
                rw = max(1, min(rw, img_w - rx))
                rh = max(1, min(rh, img_h - ry))
                
                # Extract ROI
                roi = img[ry:ry+rh, rx:rx+rw]
                if roi.size == 0:
                    raise ValueError("Calculated empty Region of Interest (ROI) for inpainting")
                    
                # Convert ROI to grayscale
                gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
                
                if smart_mode:
                    # Structuring element size based on ROI dimension for high-fidelity stroke morphology
                    kernel_sz = max(9, min(rw, rh) // 4)
                    if kernel_sz % 2 == 0:
                        kernel_sz += 1
                    se = cv2.getStructuringElement(cv2.MORPH_RECT, (kernel_sz, kernel_sz))
                    
                    tophat = cv2.morphologyEx(gray, cv2.MORPH_TOPHAT, se)
                    blackhat = cv2.morphologyEx(gray, cv2.MORPH_BLACKHAT, se)
                    
                    # Take the maximum response to capture both dark and light watermark strokes
                    stroke_energy = cv2.max(tophat, blackhat)
                    stroke_energy_blurred = cv2.GaussianBlur(stroke_energy, (3, 3), 0)
                    
                    mean_val = np.mean(stroke_energy_blurred)
                    std_val = np.std(stroke_energy_blurred)
                    
                    # Adaptively segment strokes using mean and standard deviation
                    threshold_val = max(12.0, mean_val + 1.8 * std_val)
                    _, mask_roi = cv2.threshold(stroke_energy_blurred, threshold_val, 255, cv2.THRESH_BINARY)
                    
                    # Check fill ratio. If smart mode detects too little or too much, fallback to box/standard
                    non_zero_ratio = np.count_nonzero(mask_roi) / max(1, mask_roi.size)
                    if non_zero_ratio < 0.002 or non_zero_ratio > 0.80:
                        # Fallback to solid box for safety
                        mask_roi = np.ones_like(gray) * 255
                    else:
                        # Gentle dilation to catch anti-aliased borders
                        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
                        mask_roi = cv2.dilate(mask_roi, kernel, iterations=1)
                else:
                    # Solid Box mode: mask the entire user-drawn rectangle
                    mask_roi = np.ones_like(gray) * 255
                
                # Overlay onto full image size mask
                mask = np.zeros(img.shape[:2], dtype=np.uint8)
                mask[ry:ry+rh, rx:rx+rw] = mask_roi
                
                # Execute premium texture-aware inpainting
                inpainted = texture_aware_inpaint(img, mask, grain_blend=grain_blend, inpaint_radius=3)
                
                # Encode final image back supporting raw extension
                _, ext = os.path.splitext(img_path)
                success, encoded_img = cv2.imencode(ext if ext else '.png', inpainted)
                if not success:
                    raise ValueError("Failed to encode inpainted image")
                    
                out_b64 = base64.b64encode(encoded_img.tobytes()).decode('utf-8')
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({'status': 'success', 'image': out_b64}).encode('utf-8'))
                
            except Exception as e:
                try:
                    import traceback
                    app_data = os.getenv('APPDATA')
                    if app_data:
                        log_dir = os.path.join(app_data, "com.cosmo.symphony")
                        log_file = os.path.join(log_dir, "cosmo_enhance_server.log")
                        with open(log_file, 'a', encoding='utf-8') as lf:
                            lf.write("\n=== REQUEST EXCEPTION TRACEBACK ===\n")
                            traceback.print_exc(file=lf)
                            lf.write("===================================\n")
                except Exception:
                    pass
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({'error': str(e)}).encode('utf-8'))
        elif self.path == '/remove_background':
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                post_data = self.rfile.read(content_length)
                payload = json.loads(post_data.decode('utf-8'))
                
                img_path = payload['path']
                
                # Load image supporting Unicode paths on Windows
                img = safe_read_image(img_path)
                if img is None:
                    raise ValueError(f"Could not load image from: {img_path}")
                
                # Dynamic import of rembg
                from rembg import remove
                
                # remove() returns the image with transparency (BGRA)
                result = remove(img)
                
                # Autocrop transparent borders to keep image size small
                if result.ndim == 3 and result.shape[2] == 4:
                    alpha = result[:, :, 3]
                    pts = np.argwhere(alpha > 5) # Find non-transparent pixels
                    if pts.size > 0:
                        y_min, x_min = pts.min(axis=0)
                        y_max, x_max = pts.max(axis=0)
                        
                        # Add a small 4px padding so we don't clip the edges of the subject
                        h, w = result.shape[:2]
                        y_min = max(0, y_min - 4)
                        x_min = max(0, x_min - 4)
                        y_max = min(h - 1, y_max + 4)
                        x_max = min(w - 1, x_max + 4)
                        
                        result = result[y_min:y_max+1, x_min:x_max+1]
                
                # Resolve output path next to the original file, always as a transparent WebP sticker
                ext_idx = img_path.rfind('.')
                if ext_idx != -1:
                    base_path = img_path[:ext_idx] + '_sticker'
                else:
                    base_path = img_path + '_sticker'
                    
                out_path = base_path + '.webp'
                
                # Generate unique index name if sticker already exists
                index = 1
                while os.path.exists(out_path):
                    out_path = f"{base_path}_{index:03d}.webp"
                    index += 1
                
                # Encode as WebP with high quality (90) to support transparency and keep file size extremely small
                webp_quality = 90
                success, encoded_img = cv2.imencode('.webp', result, [int(cv2.IMWRITE_WEBP_QUALITY), webp_quality] if hasattr(cv2, 'IMWRITE_WEBP_QUALITY') else [64, webp_quality])
                if not success:
                    raise ValueError("Failed to encode transparent sticker")
                    
                encoded_img.tofile(out_path)
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({'status': 'success', 'path': out_path}).encode('utf-8'))
                
            except Exception as e:
                try:
                    import traceback
                    app_data = os.getenv('APPDATA')
                    if app_data:
                        log_dir = os.path.join(app_data, "com.cosmo.symphony")
                        log_file = os.path.join(log_dir, "cosmo_enhance_server.log")
                        with open(log_file, 'a', encoding='utf-8') as lf:
                            lf.write("\n=== REQUEST EXCEPTION TRACEBACK ===\n")
                            traceback.print_exc(file=lf)
                            lf.write("===================================\n")
                except Exception:
                    pass
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({'error': str(e)}).encode('utf-8'))
        elif self.path == '/generate_store_logos':
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                post_data = self.rfile.read(content_length)
                payload = json.loads(post_data.decode('utf-8'))
                
                img_path = payload['path']
                bg_color_hex = payload.get('bg_color', '#00000000') # hex with alpha
                
                # Load image using PIL for easy alpha-channel padding and resizing
                from PIL import Image
                img = Image.open(img_path)
                
                # Parse bg color (support #RRGGBBAA or #RRGGBB)
                bg_color_hex = bg_color_hex.lstrip('#')
                if len(bg_color_hex) == 8:
                    r = int(bg_color_hex[0:2], 16)
                    g = int(bg_color_hex[2:4], 16)
                    b = int(bg_color_hex[4:6], 16)
                    a = int(bg_color_hex[6:8], 16)
                    bg_color = (r, g, b, a)
                elif len(bg_color_hex) == 6:
                    r = int(bg_color_hex[0:2], 16)
                    g = int(bg_color_hex[2:4], 16)
                    b = int(bg_color_hex[4:6], 16)
                    bg_color = (r, g, b, 255)
                else:
                    bg_color = (0, 0, 0, 0)
                
                # Define targets: list of (name, width, height)
                targets = [
                    ("poster_art_720x1080.png", 720, 1080),
                    ("box_art_1080x1080.png", 1080, 1080),
                    ("app_tile_300x300.png", 300, 300),
                    ("logo_150x150.png", 150, 150),
                    ("logo_71x71.png", 71, 71)
                ]
                
                # Create a subfolder next to the image
                parent_dir = os.path.dirname(img_path)
                stem = os.path.splitext(os.path.basename(img_path))[0]
                output_dir = os.path.join(parent_dir, f"{stem}_store_logos")
                os.makedirs(output_dir, exist_ok=True)
                
                generated_paths = []
                
                for filename, tw, th in targets:
                    # Resize while keeping aspect ratio (fit inside the box)
                    logo = img.copy()
                    logo.thumbnail((tw, th), Image.Resampling.LANCZOS)
                    
                    # Create background canvas
                    canvas = Image.new("RGBA", (tw, th), bg_color)
                    
                    # Center the logo on the canvas
                    lw, lh = logo.size
                    x = (tw - lw) // 2
                    y = (th - lh) // 2
                    canvas.paste(logo, (x, y), logo if logo.mode == 'RGBA' else None)
                    
                    target_path = os.path.join(output_dir, filename)
                    canvas.save(target_path, "PNG")
                    generated_paths.append(target_path)
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({
                    'status': 'success',
                    'output_dir': output_dir,
                    'files': generated_paths
                }).encode('utf-8'))
                
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({'error': str(e)}).encode('utf-8'))
        else:
            self.send_response(404)
            self.end_headers()

if __name__ == '__main__':
    if '--check-cuda' in sys.argv:
        try:
            import torch
            if torch.cuda.is_available():
                print("cuda")
            else:
                try:
                    import torch_directml
                    if torch_directml.is_available():
                        print("dml")
                    else:
                        print("cpu")
                except Exception:
                    print("cpu")
        except Exception:
            print("cpu")
        sys.exit(0)

    if len(sys.argv) > 2:
        # CLI Mode
        input_path = sys.argv[1]
        output_path = sys.argv[2]
        try:
            print(f"Upscaling in CLI mode: {input_path} -> {output_path}")
            init_models()
            enhanced, used_ai = process_enhance(input_path, fidelity=0.5)
            
            # Save enhanced image supporting Unicode paths with optimal compression
            _, ext = os.path.splitext(output_path)
            ext_lower = ext.lower() if ext else '.png'
            params = []
            if ext_lower in ['.jpg', '.jpeg']:
                params = [cv2.IMWRITE_JPEG_QUALITY, 85]
            elif ext_lower == '.png':
                params = [cv2.IMWRITE_PNG_COMPRESSION, 6]
            elif ext_lower == '.webp':
                params = [cv2.IMWRITE_WEBP_QUALITY, 80]
                
            success, encoded_img = cv2.imencode(ext_lower, enhanced, params)
            if not success and ext_lower == '.webp':
                print("WebP encoding failed. Falling back to PNG format...", file=sys.stderr)
                ext_lower = '.png'
                output_path = os.path.splitext(output_path)[0] + '.png'
                params = [cv2.IMWRITE_PNG_COMPRESSION, 6]
                success, encoded_img = cv2.imencode(ext_lower, enhanced, params)

            if not success:
                raise ValueError("Failed to encode upscaled image")
            encoded_img.tofile(output_path)
            print(f"[USED_AI={used_ai}]")
            print("Upscale successful!")
            sys.exit(0)
        except Exception as e:
            print(f"CLI Error: {e}", file=sys.stderr)
            sys.exit(1)
    else:
        # Server Mode
        app_data = os.getenv('APPDATA')
        if app_data:
            log_dir = os.path.join(app_data, "com.cosmo.symphony")
            os.makedirs(log_dir, exist_ok=True)
            log_file = os.path.join(log_dir, "cosmo_enhance_server.log")
            try:
                # Open log file in append mode, with line buffering
                f = open(log_file, 'a', encoding='utf-8', buffering=1)
                sys.stdout = f
                sys.stderr = f
            except Exception as e:
                pass
        
        print("\n--- Cosmo AI Enhancement Server Startup ---", flush=True)
        import datetime
        print(f"Time: {datetime.datetime.now()}", flush=True)
        print("Starting Cosmo AI Enhancement Server on port 12000...", flush=True)
        server = HTTPServer(('127.0.0.1', 12000), EnhanceHandler)
        print("Server running at http://127.0.0.1:12000/", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server...", flush=True)
            server.server_close()