# JECRC Hospital Supply Chain & Tender Procurement Portal

## Overview
This repository contains the institutional SCM and Tender Procurement platform for JECRC Hospital and Medical College. 
It operates as a modular monolith.

## Prerequisites
- Node.js 18+ (or 20+)
- Python 3.11+
- MySQL 8.0+

## Development Setup

See `docs/DEVELOPMENT.md` for full instructions.

1. Copy `.env.example` to `.env` and fill in local values.
2. Setup backend with `python -m venv .venv` and `pip install -r backend/pyproject.toml` (using uv/pip).
3. Setup frontend with `npm install` inside the `frontend/` directory.
4. Run migrations with `alembic upgrade head`.

## Architecture
See `docs/ARCHITECTURE.md` for a complete breakdown of the system.
