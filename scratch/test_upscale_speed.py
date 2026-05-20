import os
import sys
import time

# Add root folder to sys.path so we can import cosmo_enhance
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

print("--- COSMO SPEED TEST: RTX 5080 BENCHMARK ---")

# Step 1: Benchmark Cold Model Import and Setup
print("1. Measuring cold PyTorch and dependency import time...")
start_import = time.perf_counter()
import torch
import cv2
import numpy as np
end_import = time.perf_counter()
import_duration = end_import - start_import
print(f"   -> Import Time: {import_duration:.4f} seconds")

# Step 2: Time the Model Warm-Loading (disk to VRAM)
print("\n2. Measuring model warm-loading (Disk -> System RAM -> GPU VRAM)...")
start_load = time.perf_counter()
import cosmo_enhance
cosmo_enhance.init_models()
end_load = time.perf_counter()
load_duration = end_load - start_load
print(f"   -> Model Load Time: {load_duration:.4f} seconds")

# Step 3: Inspect the input image
img_path = r"D:\Pics\PA280080.JPG"
img = cv2.imread(img_path)
if img is None:
    print(f"Error: Could not read image at {img_path}")
    sys.exit(1)

h, w, c = img.shape
print(f"\n3. Input Image Dimensions: {w}x{h} ({c} channels, {os.path.getsize(img_path)/1024/1024:.2f} MB)")

# Step 4: Measure Inference Time (the actual upscaling math)
print("\n4. Running GPU Upscaling (GFPGAN + Real-ESRGAN)...")
start_inference = time.perf_counter()
result_img = cosmo_enhance.process_enhance(img_path, fidelity=0.5)
end_inference = time.perf_counter()
inference_duration = end_inference - start_inference
print(f"   -> GPU Upscale Inference Time: {inference_duration:.4f} seconds")

# Step 5: Save and print output
output_path = r"D:\Pics\PA280080_test_upscaled.JPG"
cv2.imwrite(output_path, result_img)
out_h, out_w, _ = result_img.shape
print(f"\n5. Upscaled Output Dimensions: {out_w}x{out_h} (Saved to: {output_path})")

print("\n--- SUMMARY OF RESULTS ---")
print(f"Cold Startup / CLI Mode total time: {import_duration + load_duration + inference_duration:.4f} seconds")
print(f"Warmloaded HTTP Server Mode total time: {inference_duration:.4f} seconds (Blackwell speed!)")
