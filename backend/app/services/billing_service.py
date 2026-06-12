from __future__ import annotations

class BillingService:
    def __init__(self, db=None):
        self.db = db

    async def calculate_tariff(self, **kwargs):
        return {"gross_bill": 0.0, "net_bill": 0.0, "total_deductions": 0.0}