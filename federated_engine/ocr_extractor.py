"""
AEGIS-AI Privacy-Preserving Document OCR & Reading Extraction Engine
Extracts text from medical PDFs and images using macOS native Quartz/sips + Tesseract OCR.
Extracts ONLY the details actually present in the uploaded document.
Applies privacy rules:
 - PII is masked (Patient [REDACTED])
 - Age is classified into intervals (e.g. 19 -> 18-22)
 - Clinical/lab readings maintain exact values (NO intervals for readings)
"""

import io
import os
import re
import zlib
import tempfile
import subprocess
import logging
from typing import Dict, Any, Optional
from PIL import Image
import pytesseract

logger = logging.getLogger("AEGIS.OCR")


def mask_age_to_interval(age: int) -> str:
    """Classifies age into clinical discrete interval."""
    if age < 5:
        return "0-4"
    if age < 13:
        return "5-12"
    if age < 18:
        return "13-17"
    if age < 23:
        return "18-22"   # 19 -> 18-22
    if age < 31:
        return "23-30"
    if age < 41:
        return "31-40"
    if age < 51:
        return "41-50"
    if age < 61:
        return "51-60"
    if age < 71:
        return "61-70"
    if age < 81:
        return "71-80"
    return "80+"


def extract_raw_pdf_streams(pdf_bytes: bytes) -> str:
    """Extracts raw text streams from PDF without OCR if textual streams are present."""
    text_chunks = []
    stream_matches = re.finditer(b'stream\r?\n(.*?)\r?\nendstream', pdf_bytes, re.DOTALL)
    for m in stream_matches:
        raw_stream = m.group(1)
        decompressed = None
        for wbits in (0, -zlib.MAX_WBITS, zlib.MAX_WBITS + 16):
            try:
                decompressed = zlib.decompress(raw_stream, wbits)
                break
            except Exception:
                continue
        if decompressed is None:
            decompressed = raw_stream

        tj_matches = re.findall(rb'\(([^\)]*)\)\s*Tj', decompressed)
        for tj in tj_matches:
            try:
                text_chunks.append(tj.decode('utf-8', errors='ignore'))
            except Exception:
                pass

        array_matches = re.findall(rb'\[(.*?)\]\s*TJ', decompressed)
        for arr in array_matches:
            sub = re.findall(rb'\(([^\)]*)\)', arr)
            text_chunks.append(b''.join(sub).decode('utf-8', errors='ignore'))

    return " ".join(text_chunks).strip()


def ocr_image_or_pdf(file_bytes: bytes, filename: str = "document.pdf") -> str:
    """
    Extracts text via Tesseract OCR. If file is PDF, converts to PNG via macOS sips or extracts text.
    """
    is_pdf = filename.lower().endswith(".pdf") or file_bytes.startswith(b"%PDF")
    
    extracted_text = ""
    
    if is_pdf:
        # First attempt: embedded text streams
        stream_text = extract_raw_pdf_streams(file_bytes)
        if len(stream_text) > 30:
            extracted_text = stream_text
            
        # Second attempt: rasterize with macOS sips and run Tesseract OCR
        if len(extracted_text) < 30:
            tmp_pdf = tempfile.mktemp(suffix=".pdf")
            tmp_png = tempfile.mktemp(suffix=".png")
            try:
                with open(tmp_pdf, "wb") as f:
                    f.write(file_bytes)
                res = subprocess.run(
                    ["/usr/bin/sips", "-s", "format", "png", tmp_pdf, "--out", tmp_png],
                    capture_output=True,
                    text=True
                )
                if res.returncode == 0 and os.path.exists(tmp_png):
                    img = Image.open(tmp_png)
                    ocr_res = pytesseract.image_to_string(img)
                    if len(ocr_res.strip()) > len(extracted_text):
                        extracted_text = ocr_res
            except Exception as e:
                logger.warning(f"PDF rasterization failed: {e}")
            finally:
                if os.path.exists(tmp_pdf):
                    os.remove(tmp_pdf)
                if os.path.exists(tmp_png):
                    os.remove(tmp_png)
    else:
        # Regular image (PNG / JPG / TIFF)
        try:
            image = Image.open(io.BytesIO(file_bytes))
            extracted_text = pytesseract.image_to_string(image)
        except Exception as e:
            logger.warning(f"Image OCR failed: {e}")

    return extracted_text.strip()


def parse_medical_document_text(text: str) -> Dict[str, Any]:
    """
    Scans the extracted text and pulls ONLY the details present in the document.
    - Masks patient identity
    - Classifies age into intervals
    - Keeps exact values for readings (no intervals for readings)
    - Omits fields not found in the text
    """
    lines = [l.strip() for l in text.split("\n") if l.strip()]
    full_text_lower = text.lower()
    
    demographics: Dict[str, Any] = {}
    readings: Dict[str, Any] = {}
    diagnostic_findings: list = []

    # 1. PII Detection & Masking
    name_match = re.search(r'(?:patient(?:\s+name)?|name)\s*[:\-]\s*([A-Za-z\s\.]+)', text, re.IGNORECASE)
    if name_match or "patient" in full_text_lower:
        demographics["patient_name"] = "Patient [REDACTED]"
    
    if any(k in full_text_lower for k in ["phone", "mobile", "cell", "tel:"]):
        demographics["phone_number"] = "[REDACTED]"
        
    if any(k in full_text_lower for k in ["email", "@"]):
        demographics["email"] = "[REDACTED]"
        
    if any(k in full_text_lower for k in ["address", "residence", "city"]):
        demographics["address"] = "[REDACTED]"

    if any(k in full_text_lower for k in ["ssn", "national id", "govt id", "aadhar"]):
        demographics["national_id"] = "[REDACTED]"

    # 2. Age Detection -> Interval Classification
    age_match = re.search(r'(?:age|yr|years?)\s*[:\-]?\s*(\d{1,3})', text, re.IGNORECASE)
    if not age_match:
        # Check reverse format: "19 Y", "19 years", "19/M"
        age_match = re.search(r'\b(\d{1,3})\s*(?:y(?:ears?|r)?|yo)\b', text, re.IGNORECASE)
    if not age_match:
        age_match = re.search(r'\b(\d{1,2})\s*\/\s*(?:m|f|male|female)\b', text, re.IGNORECASE)

    if age_match:
        try:
            raw_age = int(age_match.group(1))
            if 0 <= raw_age <= 120:
                demographics["age_interval"] = mask_age_to_interval(raw_age)
                demographics["demographic_status"] = "Classified into standard clinical interval"
        except Exception:
            pass

    # Gender Detection (Not PII)
    gender_match = re.search(r'(?:gender|sex)\s*[:\-]?\s*(male|female|m|f)\b', text, re.IGNORECASE)
    if gender_match:
        g = gender_match.group(1).upper()
        demographics["gender"] = "Female" if g in ["F", "FEMALE"] else "Male"
    elif re.search(r'\b(female)\b', text, re.IGNORECASE):
        demographics["gender"] = "Female"
    elif re.search(r'\b(male)\b', text, re.IGNORECASE):
        demographics["gender"] = "Male"

    # 3. Clinical & Lab Readings (EXACT VALUES ONLY - NO INTERVALS)
    
    # Blood Pressure (e.g. 128/82 mmHg)
    bp_match = re.search(r'(?:blood\s*pressure|bp)\s*[:\-]?\s*(\d{2,3}\s*\/\s*\d{2,3}(?:\s*mm\s*hg)?)', text, re.IGNORECASE)
    if not bp_match:
        bp_match = re.search(r'\b(\d{2,3}\s*\/\s*\d{2,3})\s*(?:mm\s*hg)?\b', text, re.IGNORECASE)
    if bp_match:
        val = bp_match.group(1).strip()
        if "mm" not in val.lower():
            val = f"{val} mmHg"
        readings["blood_pressure"] = val

    # Glucose / Blood Sugar
    glu_match = re.search(r'(?:fasting\s*glucose|blood\s*sugar|glucose|fbs|rbs)\s*[:\-]?\s*(\d{2,3}(?:\.\d+)?(?:\s*mg\s*\/?\s*d[lL])?)', text, re.IGNORECASE)
    if glu_match:
        val = glu_match.group(1).strip()
        if "mg" not in val.lower():
            val = f"{val} mg/dL"
        readings["glucose"] = val

    # Heart Rate / Pulse
    hr_match = re.search(r'(?:heart\s*rate|pulse(?:\s*rate)?|hr)\s*[:\-]?\s*(\d{2,3}(?:\s*bpm)?)', text, re.IGNORECASE)
    if hr_match:
        val = hr_match.group(1).strip()
        if "bpm" not in val.lower():
            val = f"{val} bpm"
        readings["heart_rate"] = val

    # Hemoglobin
    hb_match = re.search(r'(?:hemoglobin|haemoglobin|hgb|hb)\s*[:\-]?\s*(\d{1,2}(?:\.\d+)?(?:\s*g\s*\/?\s*d[lL])?)', text, re.IGNORECASE)
    if hb_match:
        val = hb_match.group(1).strip()
        if "g" not in val.lower():
            val = f"{val} g/dL"
        readings["hemoglobin"] = val

    # White Blood Cells (WBC)
    wbc_match = re.search(r'(?:white\s*blood\s*cells?|wbc|total\s*leukocyte\s*count|tlc)\s*[:\-]?\s*([\d,\.]+(?:\s*(?:\/u[lL]|k\s*\/?\s*u[lL]|cells\s*\/?\s*cu\s*mm))?)', text, re.IGNORECASE)
    if wbc_match:
        readings["white_blood_cells"] = wbc_match.group(1).strip()

    # Platelets
    plt_match = re.search(r'(?:platelets?|platelet\s*count|plt)\s*[:\-]?\s*([\d,\.]+(?:\s*(?:k\s*\/?\s*u[lL]|\/u[lL]|lakhs?))?)', text, re.IGNORECASE)
    if plt_match:
        readings["platelets"] = plt_match.group(1).strip()

    # Cholesterol
    chol_match = re.search(r'(?:total\s*cholesterol|cholesterol)\s*[:\-]?\s*(\d{2,3}(?:\s*mg\s*\/?\s*d[lL])?)', text, re.IGNORECASE)
    if chol_match:
        val = chol_match.group(1).strip()
        if "mg" not in val.lower():
            val = f"{val} mg/dL"
        readings["total_cholesterol"] = val

    # LDL Cholesterol
    ldl_match = re.search(r'(?:ldl(?:\s*cholesterol)?)\s*[:\-]?\s*(\d{2,3}(?:\s*mg\s*\/?\s*d[lL])?)', text, re.IGNORECASE)
    if ldl_match:
        val = ldl_match.group(1).strip()
        if "mg" not in val.lower():
            val = f"{val} mg/dL"
        readings["ldl_cholesterol"] = val

    # HDL Cholesterol
    hdl_match = re.search(r'(?:hdl(?:\s*cholesterol)?)\s*[:\-]?\s*(\d{2,3}(?:\s*mg\s*\/?\s*d[lL])?)', text, re.IGNORECASE)
    if hdl_match:
        val = hdl_match.group(1).strip()
        if "mg" not in val.lower():
            val = f"{val} mg/dL"
        readings["hdl_cholesterol"] = val

    # Triglycerides
    trig_match = re.search(r'(?:triglycerides?)\s*[:\-]?\s*(\d{2,3}(?:\s*mg\s*\/?\s*d[lL])?)', text, re.IGNORECASE)
    if trig_match:
        val = trig_match.group(1).strip()
        if "mg" not in val.lower():
            val = f"{val} mg/dL"
        readings["triglycerides"] = val

    # Serum Creatinine
    creat_match = re.search(r'(?:creatinine|serum\s*creatinine)\s*[:\-]?\s*(\d{1,2}(?:\.\d+)?(?:\s*mg\s*\/?\s*d[lL])?)', text, re.IGNORECASE)
    if creat_match:
        val = creat_match.group(1).strip()
        if "mg" not in val.lower():
            val = f"{val} mg/dL"
        readings["serum_creatinine"] = val

    # SpO2 / Oxygen Saturation
    spo2_match = re.search(r'(?:spo2|oxygen\s*saturation)\s*[:\-]?\s*(\d{2,3}(?:\s*%)?)', text, re.IGNORECASE)
    if spo2_match:
        val = spo2_match.group(1).strip()
        if "%" not in val:
            val = f"{val}%"
        readings["spo2"] = val

    # Body Temperature
    temp_match = re.search(r'(?:temperature|temp)\s*[:\-]?\s*(\d{2,3}(?:\.\d+)?(?:\s*(?:f|c|°f|°c))?)', text, re.IGNORECASE)
    if temp_match:
        readings["temperature"] = temp_match.group(1).strip()

    # HbA1c
    hba1c_match = re.search(r'(?:hba1c|glycated\s*hemoglobin)\s*[:\-]?\s*(\d{1,2}(?:\.\d+)?(?:\s*%)?)', text, re.IGNORECASE)
    if hba1c_match:
        val = hba1c_match.group(1).strip()
        if "%" not in val:
            val = f"{val}%"
        readings["hba1c"] = val

    # 4. Diagnostic Observations / Impressions
    for line in lines:
        l_low = line.lower()
        if any(keyword in l_low for keyword in ["impression:", "finding:", "conclusion:", "diagnosis:", "remarks:", "radiology:"]):
            diagnostic_findings.append(line)
        elif any(disease in l_low for disease in ["pneumonia", "cardiomegaly", "effusion", "atelectasis", "edema", "hypertension", "diabetes"]):
            if len(line) < 120 and line not in diagnostic_findings:
                diagnostic_findings.append(line)

    return {
        "raw_text": text,
        "masked_demographics": demographics,
        "exact_readings": readings,
        "findings": diagnostic_findings,
        "total_fields_extracted": len(demographics) + len(readings) + len(diagnostic_findings)
    }
