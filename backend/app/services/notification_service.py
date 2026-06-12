from __future__ import annotations
from typing import Any, List
from sqlalchemy.ext.asyncio import AsyncSession

class NotificationService:
    def __init__(self, db=None):
        self.db = db
        self._connections: List[Any] = []

    async def send(self, user_id: int, message: str, **kwargs) -> None:
        pass

    async def broadcast(self, message: str, **kwargs) -> None:
        pass

    async def get_notifications(self, user_id: int, **kwargs):
        return []

    def add_connection(self, websocket: Any) -> None:
        self._connections.append(websocket)

    def remove_connection(self, websocket: Any) -> None:
        self._connections.discard(websocket) if hasattr(self._connections, 'discard') else None
