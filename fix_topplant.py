with open('/app/app/api/v1/auth_and_analytics.py') as f:
    c = f.read()

old = """    top_plants: list[TopPlantEntry] = ["""
new = """    fuel_map = {'Gas': 'Natural Gas', 'HFO': 'HFO', 'Coal': 'Coal', 'Oil': 'Furnace Oil', 'Diesel': 'Diesel', 'Water': 'Hydro', 'Solar': 'Solar', 'Natural Gas': 'Natural Gas', 'Furnace Oil': 'Furnace Oil', 'Hydro': 'Hydro'}
    top_plants: list[TopPlantEntry] = ["""

c = c.replace(old, new)

c = c.replace(
    'plant_id=str(r["plant_id"]),',
    'plant_id=uuid.UUID(int=int(r["plant_id"])) if isinstance(r["plant_id"], int) else uuid.UUID(str(r["plant_id"])),'
)

c = c.replace(
    'fuel_type=r["fuel_type"],',
    'fuel_type=fuel_map.get(str(r["fuel_type"]), "Natural Gas"),'
)

with open('/app/app/api/v1/auth_and_analytics.py', 'w') as f:
    f.write(c)
print('Done')
