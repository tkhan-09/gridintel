content = """from sqlalchemy import Column, Integer, String
from app.models.base import Base

class Office(Base):
    __tablename__ = "offices"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(150), nullable=False)
    code = Column(String(20), nullable=False, unique=True)
    region = Column(String(100), nullable=True)
"""
with open('/app/app/models/office.py', 'w') as f:
    f.write(content)
print('Done')
