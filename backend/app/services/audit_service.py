from __future__ import annotations

class AuditService:
    def __init__(self, db=None):
        self.db = db

    async def log(self, action: str, user_id: int = None, resource: str = None, details: dict = None, ip_address: str = None) -> None:
        pass

    async def get_logs(self, **kwargs):
        return []
