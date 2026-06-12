# Rebuild __init__.py with unique imports only
content = """from app.models.role import Role
from app.models.office import Office
from app.models.user import User
from app.models.plant import Plant, PlantStatus, FuelType, Technology, Ownership
from app.models.meter import Meter, MeterType, MeterDirection
from app.models.meter_cf_history import MeterCFHistory
from app.models.omf_history import OMFHistory
from app.models.billing import Billing, FuelDeduction, PenaltyDeduction, Invoice
from app.models.adjustment import Adjustment
from app.models.anomaly_alert import AnomalyAlert
from app.models.energy_balance import EnergyBalance
from app.models.mod_reading import MODReading
from app.models.mod_submission import MODSubmission
from app.models.cross_border import CrossBorderCircuit, CrossBorderReading
from app.models.utility_sales import UtilitySales
from app.models.notification import Notification
from app.models.audit_log import AuditLog
from app.models.report import Report
from app.models.forecast import Forecast
from app.models.month_lock import MonthLock
from app.models.system_logs import RAGDocument
"""
with open('/app/app/models/__init__.py', 'w') as f:
    f.write(content)
print('Done')
