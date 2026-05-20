import os
import sys
import torch
import cv2
import numpy as np

models_dir = r"C:\Users\louis\OneDrive\Documents\GitHub\Video\.cosmo_models"
realesrgan_path = os.path.join(models_dir, "RealESRGAN_x4plus.pth")
gfpgan_path = os.path.join(models_dir, "GFPGANv1.4.pth")

from realesrgan import RealESRGANer
from gfpgan import GFPGANer
from basicsr.archs.rrdbnet_arch import RRDBNet

model = RRDBNet(num_in_ch=3, num_out_ch=3, num_feat=64, num_block=23, num_grow_ch=32, scale=4)
upscaler = RealESRGANer(
    scale=4,
    model_path=realesrgan_path,
    model=model,
    tile=0,
    tile_pad=10,
    pre_pad=0,
    half=True,
    device='cuda'
)

gfpganer = GFPGANer(
    model_path=gfpgan_path,
    upscale=4,
    arch='clean',
    channel_multiplier=2,
    bg_upsampler=upscaler
)

print("Running enhance on dummy black image...")
img = np.zeros((128, 128, 3), dtype=np.uint8)
_, _, restored_img = gfpganer.enhance(
    img,
    has_aligned=False,
    only_center_face=False,
    paste_back=True,
    weight=0.5
)
print("Enhanced shape:", restored_img.shape)
