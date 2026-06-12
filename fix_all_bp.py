import os, re

models_dir = '/app/app/models'
for fname in os.listdir(models_dir):
    if not fname.endswith('.py') or fname == '__init__.py' or fname == 'base.py':
        continue
    fp = os.path.join(models_dir, fname)
    f = open(fp)
    c = f.read()
    f.close()
    new = re.sub(r'\s*back_populates="[^"]+",?\n', '\n', c)
    if new != c:
        f = open(fp, 'w')
        f.write(new)
        f.close()
        print('Fixed:', fname)
print('Done')
