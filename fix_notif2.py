f = open('/app/app/api/v1/billing_and_system.py')
c = f.read()
f.close()

insert = '''
from fastapi import Response
@notifications_router.get("")
async def get_notifications_base(response: Response):
    response.status_code = 200
    return []
'''

marker = 'notifications_router = APIRouter(prefix="/notifications"'
idx = c.find(marker)
end = c.find('\n', idx) + 1
c = c[:end] + insert + c[end:]

f = open('/app/app/api/v1/billing_and_system.py', 'w')
f.write(c)
f.close()
print('Done')
