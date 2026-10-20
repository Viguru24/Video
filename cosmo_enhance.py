import os
import sys
import time
import json
import base64
import numpy as np
import cv2
from http.server import HTTPServer, BaseHTTPRequestHandler

# Ensure script directory is on sys.path for submodule imports
script_dir = os.path.dirname(os.path.abspath(__file__))
if script_dir not in sys.path:
    sys.path.insert(0, script_dir)

from cosmo_pipeline import (
    _gpu_executor,
    init_models,
    safe_read_image,
    restore_color,
    process_enhance,
    texture_aware_inpaint,
)

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
                restore_faces = bool(payload.get('restore_faces', True))
                restore_color_flag = bool(payload.get('restore_color', False))
                outscale = int(payload.get('outscale', 4))
                
                # Check if direct file path is requested
                if 'path' in payload:
                    img_path = payload['path']
                    # Process image from path
                    enhanced_img, used_ai = process_enhance(
                        img_path,
                        fidelity=fidelity,
                        restore_faces=restore_faces,
                        restore_color_flag=restore_color_flag,
                        outscale=outscale
                    )
                    
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
        elif self.path == '/detect_subject':
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                post_data = self.rfile.read(content_length)
                payload = json.loads(post_data.decode('utf-8'))
                
                img_path = payload['path']
                
                # Load image supporting Unicode paths on Windows
                img = safe_read_image(img_path)
                if img is None:
                    raise ValueError(f"Could not load image from: {img_path}")
                
                h, w = img.shape[:2]
                detected = False
                box = {"x": 15.0, "y": 15.0, "w": 70.0, "h": 70.0}
                label = "Center Focus"
                
                # Priority 1: AI Foreground Segmentation via rembg (BiRefNet / U2Net)
                try:
                    from rembg import remove
                    result = remove(img, only_mask=True)
                    # result is 2D mask (grayscale uint8) or RGBA
                    mask = result if result.ndim == 2 else (result[:, :, 3] if result.shape[2] == 4 else cv2.cvtColor(result, cv2.COLOR_BGR2GRAY))
                    pts = np.argwhere(mask > 20)
                    if pts.size > 100: # Significant foreground detected
                        y_min, x_min = pts.min(axis=0)
                        y_max, x_max = pts.max(axis=0)
                        
                        sub_w = x_max - x_min
                        sub_h = y_max - y_min
                        
                        if sub_w > 10 and sub_h > 10:
                            # Add pleasant padding (8% around subject)
                            pad_x = max(int(sub_w * 0.08), int(w * 0.02))
                            pad_y = max(int(sub_h * 0.08), int(h * 0.02))
                            
                            x_min_pad = max(0, x_min - pad_x)
                            y_min_pad = max(0, y_min - pad_y)
                            x_max_pad = min(w, x_max + pad_x)
                            y_max_pad = min(h, y_max + pad_y)
                            
                            crop_x = round((x_min_pad / w) * 100.0, 2)
                            crop_y = round((y_min_pad / h) * 100.0, 2)
                            crop_w = round(((x_max_pad - x_min_pad) / w) * 100.0, 2)
                            crop_h = round(((y_max_pad - y_min_pad) / h) * 100.0, 2)
                            
                            box = {"x": crop_x, "y": crop_y, "w": crop_w, "h": crop_h}
                            detected = True
                            label = "Person / Subject Detected"
                except Exception as seg_err:
                    print(f"rembg subject detection note: {seg_err}. Trying OpenCV detectors...", file=sys.stderr)
                
                # Priority 2: OpenCV Face & Body Detectors if rembg didn't find or errored
                if not detected:
                    try:
                        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
                        
                        # Haar Face Detector
                        face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
                        faces = face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=4, minSize=(30, 30))
                        
                        if len(faces) > 0:
                            # Compute union of detected faces
                            fx_min = min(f[0] for f in faces)
                            fy_min = min(f[1] for f in faces)
                            fx_max = max(f[0] + f[2] for f in faces)
                            fy_max = max(f[1] + f[3] for f in faces)
                            
                            face_w = fx_max - fx_min
                            face_h = fy_max - fy_min
                            
                            # Expand to capture upper body / torso and head
                            pad_top = int(face_h * 0.4)
                            pad_bottom = int(face_h * 2.5) # include torso
                            pad_sides = int(face_w * 0.8)
                            
                            x1 = max(0, fx_min - pad_sides)
                            y1 = max(0, fy_min - pad_top)
                            x2 = min(w, fx_max + pad_sides)
                            y2 = min(h, fy_max + pad_bottom)
                            
                            box = {
                                "x": round((x1 / w) * 100.0, 2),
                                "y": round((y1 / h) * 100.0, 2),
                                "w": round(((x2 - x1) / w) * 100.0, 2),
                                "h": round(((y2 - y1) / h) * 100.0, 2)
                            }
                            detected = True
                            label = "Person (Face & Body) Detected"
                    except Exception as cv_err:
                        print(f"OpenCV face detection note: {cv_err}", file=sys.stderr)
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({
                    'status': 'success',
                    'box': box,
                    'detected': detected,
                    'label': label
                }).encode('utf-8'))
                
            except Exception as e:
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