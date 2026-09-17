"""
POST /upload
Parses an uploaded resume (PDF/DOCX) or pasted resume text, plus optional JD
text, into plain text. Analysis (ATS/matching) is Phase 3 — this endpoint
only returns clean parsed text.
"""

from typing import Optional
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, status

from app.parsing.pdf_parser import extract_text_from_pdf
from app.parsing.docx_parser import extract_text_from_docx

router = APIRouter(tags=["parsing"])

ALLOWED_EXTENSIONS = {".pdf", ".docx"}


@router.post("/upload")
async def upload_resume(
    resume_file: Optional[UploadFile] = File(None),
    resume_text: Optional[str] = Form(None),
    jd_text: Optional[str] = Form(None),
):
    if not resume_file and not (resume_text and resume_text.strip()):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Attach a resume file or paste resume text.",
        )

    if resume_file:
        filename = resume_file.filename or ""
        ext = "." + filename.split(".")[-1].lower() if "." in filename else ""

        if ext not in ALLOWED_EXTENSIONS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only PDF or DOCX files are supported.",
            )

        file_bytes = await resume_file.read()

        try:
            if ext == ".pdf":
                parsed_text = extract_text_from_pdf(file_bytes)
            else:
                parsed_text = extract_text_from_docx(file_bytes)
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Couldn't read that file. Try re-saving it and uploading again.",
            )

        if not parsed_text.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No readable text found in that file. If it's a scanned/image resume, paste the text instead.",
            )
    else:
        parsed_text = resume_text.strip()

    return {
        "resumeText": parsed_text,
        "jdText": jd_text.strip() if jd_text else "",
    }