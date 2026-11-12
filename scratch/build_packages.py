import os, zipfile, shutil, json
root = r'd:\VS Code Projects\Email Web Shortcut'
ver = json.load(open(os.path.join(root, 'manifest.json'), encoding='utf-8'))['version']
for f in os.listdir(root):
    if f.endswith('.xpi') or f.endswith('.zip'):
        os.remove(os.path.join(root, f))
names = ['foxhub-firefox.xpi', 'foxhub-firefox.zip']
first = os.path.join(root, names[0])
count = 0
with zipfile.ZipFile(first, 'w', zipfile.ZIP_DEFLATED) as zf:
    zf.write(os.path.join(root, 'manifest.json'), 'manifest.json')
    for sub in ['icons', 'src']:
        for dp, _, files in os.walk(os.path.join(root, sub)):
            for fn in files:
                full = os.path.join(dp, fn)
                zf.write(full, os.path.relpath(full, root).replace('\\', '/'))
                count += 1
for n in names[1:]:
    shutil.copy2(first, os.path.join(root, n))
print('version', ver, 'files', count + 1, 'built', names)
