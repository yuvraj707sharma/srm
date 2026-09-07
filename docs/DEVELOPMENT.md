# Development Guide

## Environment Setup
Make sure you have MySQL 8.0 running locally.

1. **Database Setup**
```sql
CREATE DATABASE jecrc_scm;
```

2. **Backend Setup**
Navigate to the `backend` directory.
```bash
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -e .
```

3. **Running Backend**
```bash
uvicorn app.main:app --reload --port 8000
```

4. **Frontend Setup**
Navigate to `frontend` directory.
```bash
npm install
npm run dev
```

## Running Tests
Run the pytest suite in the `backend/tests` folder:
```bash
pytest backend/tests
```
