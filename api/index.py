# -*- coding: utf-8 -*-
"""
AIOU Help — Vercel Serverless Function Entry Point
Serves the FastAPI backend on Vercel cloud infrastructure.
"""

import os
import sys
from pathlib import Path

# Add project root to sys.path
BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

# Import the main FastAPI application
from aiou_app.server import app

# Export app for Vercel
__all__ = ["app"]
