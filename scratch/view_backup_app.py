import subprocess
out = subprocess.check_output(['git', 'show', 'feature/restore-from-backup:src/App.tsx'], encoding='utf-8', errors='ignore')
idx = out.find('className="solo-control-bar"')
if idx != -1:
    print(out[idx:idx+8000])
else:
    print('Not found')
