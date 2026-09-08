import asyncio
from app.db.session import engine
from sqlalchemy import text

async def migrate():
    async with engine.begin() as conn:
        res = await conn.execute(text("DESCRIBE boqs;"))
        existing_boqs_cols = [r[0] for r in res.fetchall()]
        if 'boq_type' not in existing_boqs_cols:
            print("Adding boq_type to boqs...")
            await conn.execute(text("ALTER TABLE boqs ADD COLUMN boq_type VARCHAR(32) DEFAULT 'COMMERCIAL';"))
        if 'extracted_data_json' not in existing_boqs_cols:
            print("Adding extracted_data_json to boqs...")
            await conn.execute(text("ALTER TABLE boqs ADD COLUMN extracted_data_json LONGTEXT NULL;"))

        res2 = await conn.execute(text("DESCRIBE boq_submissions;"))
        existing_sub_cols = [r[0] for r in res2.fetchall()]
        if 'extracted_data_json' not in existing_sub_cols:
            print("Adding extracted_data_json to boq_submissions...")
            await conn.execute(text("ALTER TABLE boq_submissions ADD COLUMN extracted_data_json LONGTEXT NULL;"))
        if 'model_no' not in existing_sub_cols:
            print("Adding model_no to boq_submissions...")
            await conn.execute(text("ALTER TABLE boq_submissions ADD COLUMN model_no VARCHAR(128) NULL;"))
        if 'tank_capacity_location' not in existing_sub_cols:
            print("Adding tank_capacity_location to boq_submissions...")
            await conn.execute(text("ALTER TABLE boq_submissions ADD COLUMN tank_capacity_location VARCHAR(255) NULL;"))

    print("Migration completed successfully!")

if __name__ == "__main__":
    asyncio.run(migrate())
