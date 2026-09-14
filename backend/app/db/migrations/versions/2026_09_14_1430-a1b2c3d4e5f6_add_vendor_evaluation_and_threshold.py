"""add_vendor_evaluation_and_threshold

Revision ID: a1b2c3d4e5f6
Revises: 9f3a2c1e8b47
Create Date: 2026-09-14 14:30:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = '9f3a2c1e8b47'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add column to vendor_organizations
    conn = op.get_bind()
    insp = sa.inspect(conn)
    columns = [c['name'] for c in insp.get_columns('vendor_organizations')]
    if 'high_value_projects_threshold_cr' not in columns:
        op.add_column('vendor_organizations', sa.Column(
            'high_value_projects_threshold_cr',
            sa.Numeric(precision=10, scale=2),
            nullable=True,
            server_default=sa.text('1.00')
        ))

    # 2. Create vendor_evaluations table if it doesn't already exist
    tables = insp.get_table_names()
    if 'vendor_evaluations' not in tables:
        op.create_table(
            'vendor_evaluations',
            sa.Column('id', sa.String(length=36), primary_key=True),
            sa.Column('vendor_organization_id', sa.String(length=36), sa.ForeignKey('vendor_organizations.id', ondelete='CASCADE'), nullable=False),
            sa.Column('hospitals_score', sa.Integer(), nullable=False, server_default=sa.text('0')),
            sa.Column('hospitals_meets', sa.Boolean(), nullable=False, server_default=sa.text('0')),
            sa.Column('hospitals_remarks', sa.Text(), nullable=True),
            sa.Column('turnover_score', sa.Integer(), nullable=False, server_default=sa.text('0')),
            sa.Column('turnover_meets', sa.Boolean(), nullable=False, server_default=sa.text('0')),
            sa.Column('turnover_remarks', sa.Text(), nullable=True),
            sa.Column('high_value_projects_score', sa.Integer(), nullable=False, server_default=sa.text('0')),
            sa.Column('high_value_projects_meets', sa.Boolean(), nullable=False, server_default=sa.text('0')),
            sa.Column('high_value_projects_remarks', sa.Text(), nullable=True),
            sa.Column('service_base_score', sa.Integer(), nullable=False, server_default=sa.text('0')),
            sa.Column('service_base_meets', sa.Boolean(), nullable=False, server_default=sa.text('0')),
            sa.Column('service_base_remarks', sa.Text(), nullable=True),
            sa.Column('balance_sheet_score', sa.Integer(), nullable=False, server_default=sa.text('0')),
            sa.Column('balance_sheet_verified', sa.Boolean(), nullable=False, server_default=sa.text('0')),
            sa.Column('balance_sheet_remarks', sa.Text(), nullable=True),
            sa.Column('total_score', sa.Integer(), nullable=False, server_default=sa.text('0')),
            sa.Column('evaluation_grade', sa.String(length=50), nullable=True),
            sa.Column('recommendation', sa.String(length=50), nullable=True),
            sa.Column('evaluator_name', sa.String(length=255), nullable=True),
            sa.Column('admin_summary_notes', sa.Text(), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False)
        )


def downgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    tables = insp.get_table_names()
    if 'vendor_evaluations' in tables:
        op.drop_table('vendor_evaluations')
    columns = [c['name'] for c in insp.get_columns('vendor_organizations')]
    if 'high_value_projects_threshold_cr' in columns:
        op.drop_column('vendor_organizations', 'high_value_projects_threshold_cr')
