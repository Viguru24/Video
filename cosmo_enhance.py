import os
import sys
import base64
import json
import numpy as np
import cv2
from http.server import HTTPServer, BaseHTTPRequestHandler

gfpganer = None
upscaler = None

def init_models():
    global gfpganer, upscaler
    if gfpganer is not None:
        return
        
    models_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".cosmo_models")
    realesrgan_path = os.path.join(models_dir, "RealESRGAN_x4plus.pth")
    gfpgan_path = os.path.join(models_dir, "GFPGANv1.4.pth")
    
    # Check if models exist, if not we fall back gracefully (resilient fallback)
    if not os.path.exists(realesrgan_path) or not os.path.exists(gfpgan_path):
        print(f"Pre-trained weights not found in {models_dir}. Running in fallback filter mode.", file=sys.stderr)
        return
        
    try:
        import torch
        from realesrgan import RealESRGANer
        from gfpgan import GFPGANer
        from basicsr.archs.rrdbnet_arch import RRDBNet
        
        if not torch.cuda.is_available():
            print("CUDA not available. Running in fallback filter mode.", file=sys.stderr)
            return
            
        model = RRDBNet(num_in_ch=3, num_out_ch=3, num_feat=64, num_block=23, num_grow_ch=32, scale=4)
        upscaler = RealESRGANer(
            scale=4,
            model_path=realesrgan_path,
            model=model,
            tile=400,
            tile_pad=10,
            pre_pad=0,
            half=True, # RTX 5080 supports FP16 perfectly!
            device='cuda'
        )
        
        gfpganer = GFPGANer(
            model_path=gfpgan_path,
            upscale=4,
            arch='clean',
            channel_multiplier=2,
            bg_upsampler=upscaler
        )
        print("Real-ESRGAN and GFPGAN models warmloaded into GPU VRAM successfully!")
    except Exception as e:
        print(f"Failed to initialize models: {e}. Running in fallback filter mode.", file=sys.stderr)

def process_enhance(img_or_bytes, fidelity=0.5):
    init_models()
    # Decode image
    if isinstance(img_or_bytes, bytes):
        nparr = np.frombuffer(img_or_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    else:
        # It's a file path string! Safe unicode reading on Windows
        img = cv2.imdecode(np.fromfile(img_or_bytes, dtype=np.uint8), cv2.IMREAD_COLOR)
        if img is None:
            img = cv2.imread(img_or_bytes, cv2.IMREAD_COLOR)
            
    if img is None:
        raise ValueError("Could not decode or read the input image.")
        
    # Run GFPGAN & Real-ESRGAN or Fallback to bilateral unsharp filter
    if gfpganer is not None:
        try:
            _, _, restored_img = gfpganer.enhance(
                img,
                has_aligned=False,
                only_center_face=False,
                paste_back=True,
                weight=fidelity
            )
            # Empty PyTorch CUDA cache to free up VRAM immediately back to the OS!
            import torch
            torch.cuda.empty_cache()
            return restored_img
        except Exception as e:
            print(f"Model inference failed: {e}. Falling back to high-fidelity resize filter.", file=sys.stderr)
            
    # Resilient high-fidelity fallback: 4x bilinear resize + bilateral filter + unsharp mask
    h, w = img.shape[:2]
    resized = cv2.resize(img, (w * 4, h * 4), interpolation=cv2.INTER_LANCZOS4)
    smoothed = cv2.bilateralFilter(resized, 9, 75, 75)
    gaussian = cv2.GaussianBlur(smoothed, (5, 5), 0)
    unsharp = cv2.addWeighted(smoothed, 1.5, gaussian, -0.5, 0)
    return unsharp

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
                    enhanced_img = process_enhance(img_path, fidelity=fidelity)
                    
                    # Resolve output path
                    if 'output_path' in payload:
                        out_path = payload['output_path']
                    else:
                        ext_idx = img_path.rfind('.')
                        if ext_idx != -1:
                            out_path = img_path[:ext_idx] + '_upscaled' + img_path[ext_idx:]
                        else:
                            out_path = img_path + '_upscaled.png'
                            
                    # Save image safely supporting Unicode paths
                    _, ext = os.path.splitext(out_path)
                    success, encoded_img = cv2.imencode(ext if ext else '.png', enhanced_img)
                    if not success:
                        raise ValueError("Failed to encode upscaled image for saving")
                        
                    encoded_img.tofile(out_path)
                    response_data = {
                        'status': 'success',
                        'path': out_path
                    }
                elif 'image' in payload:
                    img_b64 = payload['image']
                    img_bytes = base64.b64decode(img_b64)
                    
                    # Process bytes
                    enhanced_img = process_enhance(img_bytes, fidelity=fidelity)
                    
                    # Encode back to base64
                    success, encoded_img = cv2.imencode('.png', enhanced_img)
                    if not success:
                        raise ValueError("Failed to encode upscaled image to PNG")
                        
                    out_b64 = base64.b64encode(encoded_img.tobytes()).decode('utf-8')
                    response_data = {
                        'status': 'success',
                        'image': out_b64
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
                
                # Safe unicode read on Windows
                img = cv2.imdecode(np.fromfile(img_path, dtype=np.uint8), cv2.IMREAD_COLOR)
                if img is None:
                    img = cv2.imread(img_path, cv2.IMREAD_COLOR)
                    
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
                
                # Auto-detect sharp overlays/text inside ROI:
                # Get the absolute difference between gray ROI and its blurred/median median.
                # Sharp high-frequency items (edges, text, logos) stand out as large values.
                median = cv2.medianBlur(gray, 15)
                diff = cv2.absdiff(gray, median)
                
                # Threshold to isolate the sharp shapes (value of 12 works extremely well for high-contrast watermark text/lines)
                _, mask_roi = cv2.threshold(diff, 12, 255, cv2.THRESH_BINARY)
                
                # Dilate slightly (3x3 kernel) to expand boundary coverage
                kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
                mask_roi = cv2.dilate(mask_roi, kernel, iterations=1)
                
                # Overlay onto full image size mask
                mask = np.zeros(img.shape[:2], dtype=np.uint8)
                mask[ry:ry+rh, rx:rx+rw] = mask_roi
                
                # Execute OpenCV C++ Telea Fast Marching Method inpainting (extremely fast and robust locally)
                inpainted = cv2.inpaint(img, mask, inpaintRadius=3, flags=cv2.INPAINT_TELEA)
                
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
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({'error': str(e)}).encode('utf-8'))
        else:
            self.send_response(404)
            self.end_headers()

if __name__ == '__main__':
    if len(sys.argv) > 2:
        # CLI Mode
        input_path = sys.argv[1]
        output_path = sys.argv[2]
        try:
            print(f"Upscaling in CLI mode: {input_path} -> {output_path}")
            init_models()
            enhanced = process_enhance(input_path, fidelity=0.5)
            
            # Save enhanced image supporting Unicode paths
            _, ext = os.path.splitext(output_path)
            success, encoded_img = cv2.imencode(ext if ext else '.png', enhanced)
            if not success:
                raise ValueError("Failed to encode upscaled image")
            encoded_img.tofile(output_path)
            print("Upscale successful!")
            sys.exit(0)
        except Exception as e:
            print(f"CLI Error: {e}", file=sys.stderr)
            sys.exit(1)
    else:
        # Server Mode
        print("Starting Cosmo AI Enhancement Server on port 12000...")
        server = HTTPServer(('127.0.0.1', 12000), EnhanceHandler)
        print("Server running at http://127.0.0.1:12000/")
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server...")
            server.server_close()