#!/usr/bin/env python3
"""
Zad English — Offline Audio Downloader
Downloads and extracts authentic Oxford 5000 human pronunciation MP3 files (US & UK)
"""

import os
import sys
import subprocess
import urllib.request
import tempfile
import shutil

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AUDIO_DIR = os.path.join(BASE_DIR, 'audio')

BASE_URL = 'https://raw.githubusercontent.com/winterdl/oxford-5000-vocabulary-audio-definition/main/audio/'

US_PARTS = ['us_audio_split_24m.z01', 'us_audio_split_24m.z02', 'us_audio_split_24m.z03', 'us_audio_split_24m.zip']
UK_PARTS = ['uk_audio_split_24m.z01', 'uk_audio_split_24m.z02', 'uk_audio_split_24m.z03', 'uk_audio_split_24m.zip']

def download_and_extract(pack_name, parts, main_zip_name, merged_name):
    os.makedirs(AUDIO_DIR, exist_ok=True)
    tmp_dir = tempfile.mkdtemp(prefix=f'zad_audio_{pack_name}_')
    print(f"\n📦 Preparing {pack_name} Oxford Audio Pack...")

    try:
        for idx, part in enumerate(parts, 1):
            target = os.path.join(tmp_dir, part)
            print(f"  ⬇️ [{idx}/{len(parts)}] Downloading {part}...")
            url = BASE_URL + part
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req) as resp, open(target, 'wb') as f:
                while True:
                    chunk = resp.read(131072)
                    if not chunk:
                        break
                    f.write(chunk)

        merged_zip = os.path.join(tmp_dir, merged_name)
        print(f"  🔄 Merging split zip archives...")
        cmd = ['zip', '-s', '0', main_zip_name, '--out', merged_name]
        subprocess.run(cmd, cwd=tmp_dir, check=True, stdout=subprocess.DEVNULL)

        print(f"  📂 Extracting audio files to {AUDIO_DIR}...")
        cmd_unzip = ['unzip', '-q', '-n', merged_name, '-d', AUDIO_DIR]
        subprocess.run(cmd_unzip, cwd=tmp_dir, check=True)
        print(f"  ✅ {pack_name} Audio Pack installed successfully!")

    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)

def main():
    print("=" * 60)
    print("⚡ Zad English — Offline Oxford Audio Setup")
    print("=" * 60)

    download_and_extract("American English (US)", US_PARTS, "us_audio_split_24m.zip", "us_merged.zip")
    download_and_extract("British English (UK)", UK_PARTS, "uk_audio_split_24m.zip", "uk_merged.zip")

    total_files = len([f for f in os.listdir(AUDIO_DIR) if f.endswith('.mp3')])
    print("\n" + "=" * 60)
    print(f"🎉 Complete! Total offline MP3 audio files ready: {total_files}")
    print("=" * 60)

if __name__ == '__main__':
    main()
