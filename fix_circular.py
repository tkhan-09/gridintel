# Fix role.py - remove users relationship entirely (not needed for auth)
f = open('/app/app/models/role.py')
c = f.read()
f.close()
# Remove the users relationship block
import re
c = re.sub(r"\n    users: Mapped\[list\[User\]\] = relationship\([^)]+\)\n", "\n", c)
c = c.replace("from __future__ import annotations\n", "")
c = c.replace("from typing import TYPE_CHECKING, Any\n", "from typing import Any\n")
c = c.replace("if TYPE_CHECKING:\n    from app.models.user import User\n", "")
f = open('/app/app/models/role.py', 'w')
f.write(c)
f.close()
print('Done role.py')

# Fix user.py - remove back_populates from role relationship
f = open('/app/app/models/user.py')
c = f.read()
f.close()
c = c.replace("        back_populates=\"role\",\n", "")
f = open('/app/app/models/user.py', 'w')
f.write(c)
f.close()
print('Done user.py')
