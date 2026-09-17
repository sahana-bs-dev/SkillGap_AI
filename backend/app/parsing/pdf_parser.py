"""
Extracts plain text from PDF bytes.
Tries pdfplumber first (better layout handling); falls back to PyPDF2
if pdfplumber comes back empty on a given file.
"""

import io
import pdfplumber
from PyPDF2 import PdfReader


def extract_text_from_pdf(file_bytes: bytes) -> str:
    text = _extract_with_pdfplumber(file_bytes)
    if text.strip():
        return text
    return _extract_with_pypdf2(file_bytes)


def _extract_with_pdfplumber(file_bytes: bytes) -> str:
    chunks = []
    try:
        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            for page in pdf.pages:
                chunks.append(page.extract_text() or "")
    except Exception:
        return ""
    return _clean("\n".join(chunks))


def _extract_with_pypdf2(file_bytes: bytes) -> str:
    chunks = []
    reader = PdfReader(io.BytesIO(file_bytes))
    for page in reader.pages:
        chunks.append(page.extract_text() or "")
    return _clean("\n".join(chunks))


def _clean(text: str) -> str:
    lines = [line.strip() for line in text.splitlines()]
    return "\n".join(line for line in lines if line)