with open('/app/app/api/v1/copilot.py') as f:
    content = f.read()
content = content.replace(
    'from app.core.dependencies import get_current_active_user\n',
    ''
).replace(
    ', current_user=Depends(get_current_active_user)',
    ''
).replace(
    'from fastapi import APIRouter, Depends\n',
    'from fastapi import APIRouter\n'
)
with open('/app/app/api/v1/copilot.py', 'w') as f:
    f.write(content)
print('Done')
