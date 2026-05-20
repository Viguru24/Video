import os

path = r"c:\Users\louis\OneDrive\Documents\GitHub\Video\src-tauri\src\main.rs"

with open(path, 'rb') as f:
    content = f.read()

# Let's define the targets and replacements in bytes
target1 = b'    let local_py = exe_dir.as_ref()\r\n        .map(|d| d.join("cosmo_enhance.py"))\r\n        .filter(|p| p.exists());'
target1_lf = b'    let local_py = exe_dir.as_ref()\n        .map(|d| d.join("cosmo_enhance.py"))\n        .filter(|p| p.exists());'

replacement1 = b"""    let local_py = exe_dir.as_ref()
        .map(|d| d.join("cosmo_enhance.py"))
        .filter(|p| p.exists())
        .or_else(|| {
            std::env::current_dir()
                .ok()
                .map(|d| d.join("cosmo_enhance.py"))
                .filter(|p| p.exists())
        });"""

target2 = b"""    } else if let Some(py_exe) = system_python {
        let script = exe_dir.as_ref()
            .and_then(|d| {
                let s = d.join("cosmo_enhance.py");
                if s.exists() { Some(s) } else { None }
            })
            .ok_or("cosmo_enhance.py not found next to executable")?;"""

target2_lf = b"""    } else if let Some(py_exe) = system_python {
        let script = exe_dir.as_ref()
            .and_then(|d| {
                let s = d.join("cosmo_enhance.py");
                if s.exists() { Some(s) } else { None }
            })
            .ok_or("cosmo_enhance.py not found next to executable")?;""".replace(b'\r\n', b'\n')

replacement2 = b"""    } else if let Some(py_exe) = system_python {
        let script = exe_dir.as_ref()
            .and_then(|d| {
                let s = d.join("cosmo_enhance.py");
                if s.exists() { Some(s) } else { None }
            })
            .or_else(|| {
                std::env::current_dir()
                    .ok()
                    .map(|d| d.join("cosmo_enhance.py"))
                    .filter(|p| p.exists())
            })
            .ok_or("cosmo_enhance.py not found next to executable or in project root")?;"""

# Convert line endings of replacements to match the file's line endings
if b'\r\n' in content:
    replacement1 = replacement1.replace(b'\n', b'\r\n')
    replacement2 = replacement2.replace(b'\n', b'\r\n')
    content = content.replace(target1, replacement1)
    content = content.replace(target2, replacement2)
else:
    content = content.replace(target1_lf, replacement1)
    content = content.replace(target2_lf, replacement2)

with open(path, 'wb') as f:
    f.write(content)

print("Patch applied successfully!")
