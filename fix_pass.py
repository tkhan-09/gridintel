import asyncio
from sqlalchemy import text
import sys

sys.path.insert(0, '/app')
from app.core.database import AsyncSessionLocal
from app.core.security import hash_password, verify_password

h = hash_password("Admin@123")
print("New hash:", h)
print("Verify test:", verify_password("Admin@123", h))


async def update():
    async with AsyncSessionLocal() as db:
        await db.execute(text("UPDATE users SET hashed_password = :h WHERE username = :u"), {"h": h, "u": "superadmin"})
        await db.commit()

        result = await db.execute(text("SELECT hashed_password FROM users WHERE username = 'superadmin'"))
        row = result.fetchone()
        print("DB hash:", row[0])
        print("DB verify:", verify_password("Admin@123", row[0]))


asyncio.run(update())