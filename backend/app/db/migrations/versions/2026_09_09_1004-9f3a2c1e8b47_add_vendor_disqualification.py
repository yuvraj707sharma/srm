"""add_vendor_disqualification

Revision ID: 9f3a2c1e8b47
Revises: 441d6e55877e
Create Date: 2026-09-09 10:04:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '9f3a2c1e8b47'
down_revision: Union[str, Sequence[str], None] = '441d6e55877e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('boq_submissions', sa.Column(
        'is_disqualified',
        sa.Boolean(),
        nullable=False,
        server_default=sa.text('0')
    ))
    op.add_column('boq_submissions', sa.Column(
        'disqualification_note',
        sa.Text(),
        nullable=True
    ))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('boq_submissions', 'disqualification_note')
    op.drop_column('boq_submissions', 'is_disqualified')
