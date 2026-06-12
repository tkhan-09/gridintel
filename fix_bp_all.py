import os, re

models_dir = '/app/app/models'
for fname in os.listdir(models_dir):
    if not fname.endswith('.py') or fname in ('__init__.py', 'base.py'):
        continue
    fp = os.path.join(models_dir, fname)
    with open(fp) as f:
        c = f.read()
    new = re.sub(r',?\s*back_populates=["\'][^"\']+["\']', '', c)
    if new != c:
        with open(fp, 'w') as f:
            f.write(new)
        print('Fixed:', fname)
print('Done')
