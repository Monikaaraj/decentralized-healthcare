import { NextResponse } from 'next/server';
import { maskAge } from '@/utils/privacy';

function parseMedicalTextFallback(text: string) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const fullTextLower = text.toLowerCase();

  const demographics: Record<string, any> = {};
  const exactReadings: Record<string, string> = {};
  const findings: string[] = [];

  // 1. PII Masking
  if (fullTextLower.includes("name") || fullTextLower.includes("patient")) {
    demographics.patient_name = "Patient [REDACTED]";
  }
  if (fullTextLower.includes("phone") || fullTextLower.includes("mobile") || fullTextLower.includes("tel")) {
    demographics.phone_number = "[REDACTED]";
  }
  if (fullTextLower.includes("email") || fullTextLower.includes("@")) {
    demographics.email = "[REDACTED]";
  }
  if (fullTextLower.includes("address") || fullTextLower.includes("residence")) {
    demographics.address = "[REDACTED]";
  }

  // 2. Age interval classification
  const ageMatch = text.match(/(?:age|yr|years?)\s*[:\-]?\s*(\d{1,3})/i) ||
                   text.match(/\b(\d{1,3})\s*(?:y(?:ears?|r)?|yo)\b/i) ||
                   text.match(/\b(\d{1,2})\s*\/\s*(?:m|f|male|female)\b/i);
  if (ageMatch) {
    const rawAge = parseInt(ageMatch[1], 10);
    if (!isNaN(rawAge) && rawAge >= 0 && rawAge <= 120) {
      demographics.age_interval = maskAge(rawAge);
      demographics.demographic_status = "Classified into standard clinical interval";
    }
  }

  // Gender
  const genderMatch = text.match(/(?:gender|sex)\s*[:\-]?\s*(male|female|m|f)\b/i);
  if (genderMatch) {
    const g = genderMatch[1].toUpperCase();
    demographics.gender = (g === 'F' || g === 'FEMALE') ? "Female" : "Male";
  } else if (/\bfemale\b/i.test(text)) {
    demographics.gender = "Female";
  } else if (/\bmale\b/i.test(text)) {
    demographics.gender = "Male";
  }

  // 3. Exact readings (NO INTERVALS FOR READINGS)
  const bpMatch = text.match(/(?:blood\s*pressure|bp)\s*[:\-]?\s*(\d{2,3}\s*\/\s*\d{2,3}(?:\s*mm\s*hg)?)/i) ||
                  text.match(/\b(\d{2,3}\s*\/\s*\d{2,3})\s*(?:mm\s*hg)?\b/i);
  if (bpMatch) {
    let val = bpMatch[1].trim();
    if (!val.toLowerCase().includes("mm")) val += " mmHg";
    exactReadings.blood_pressure = val;
  }

  const gluMatch = text.match(/(?:fasting\s*glucose|blood\s*sugar|glucose|fbs|rbs)\s*[:\-]?\s*(\d{2,3}(?:\.\d+)?(?:\s*mg\s*\/?\s*d[lL])?)/i);
  if (gluMatch) {
    let val = gluMatch[1].trim();
    if (!val.toLowerCase().includes("mg")) val += " mg/dL";
    exactReadings.glucose = val;
  }

  const hrMatch = text.match(/(?:heart\s*rate|pulse(?:\s*rate)?|hr)\s*[:\-]?\s*(\d{2,3}(?:\s*bpm)?)/i);
  if (hrMatch) {
    let val = hrMatch[1].trim();
    if (!val.toLowerCase().includes("bpm")) val += " bpm";
    exactReadings.heart_rate = val;
  }

  const hbMatch = text.match(/(?:hemoglobin|haemoglobin|hgb|hb)\s*[:\-]?\s*(\d{1,2}(?:\.\d+)?(?:\s*g\s*\/?\s*d[lL])?)/i);
  if (hbMatch) {
    let val = hbMatch[1].trim();
    if (!val.toLowerCase().includes("g")) val += " g/dL";
    exactReadings.hemoglobin = val;
  }

  const wbcMatch = text.match(/(?:white\s*blood\s*cells?|wbc|total\s*leukocyte\s*count|tlc)\s*[:\-]?\s*([\d,\.]+(?:\s*(?:\/u[lL]|k\s*\/?\s*u[lL]|cells\s*\/?\s*cu\s*mm))?)/i);
  if (wbcMatch) {
    exactReadings.white_blood_cells = wbcMatch[1].trim();
  }

  const pltMatch = text.match(/(?:platelets?|platelet\s*count|plt)\s*[:\-]?\s*([\d,\.]+(?:\s*(?:k\s*\/?\s*u[lL]|\/u[lL]|lakhs?))?)/i);
  if (pltMatch) {
    exactReadings.platelets = pltMatch[1].trim();
  }

  const cholMatch = text.match(/(?:total\s*cholesterol|cholesterol)\s*[:\-]?\s*(\d{2,3}(?:\s*mg\s*\/?\s*d[lL])?)/i);
  if (cholMatch) {
    let val = cholMatch[1].trim();
    if (!val.toLowerCase().includes("mg")) val += " mg/dL";
    exactReadings.total_cholesterol = val;
  }

  const creatMatch = text.match(/(?:creatinine|serum\s*creatinine)\s*[:\-]?\s*(\d{1,2}(?:\.\d+)?(?:\s*mg\s*\/?\s*d[lL])?)/i);
  if (creatMatch) {
    let val = creatMatch[1].trim();
    if (!val.toLowerCase().includes("mg")) val += " mg/dL";
    exactReadings.serum_creatinine = val;
  }

  const spo2Match = text.match(/(?:spo2|oxygen\s*saturation)\s*[:\-]?\s*(\d{2,3}(?:\s*%)?)/i);
  if (spo2Match) {
    let val = spo2Match[1].trim();
    if (!val.includes("%")) val += "%";
    exactReadings.spo2 = val;
  }

  // Findings
  for (const line of lines) {
    const lLow = line.toLowerCase();
    if (["impression:", "finding:", "conclusion:", "diagnosis:", "remarks:"].some(k => lLow.includes(k))) {
      findings.push(line);
    } else if (["pneumonia", "cardiomegaly", "effusion", "atelectasis", "edema", "hypertension", "normal sinus"].some(k => lLow.includes(k))) {
      if (line.length < 120 && !findings.includes(line)) {
        findings.push(line);
      }
    }
  }

  return {
    raw_text: text,
    masked_demographics: demographics,
    exact_readings: exactReadings,
    findings: findings,
    total_fields_extracted: Object.keys(demographics).length + Object.keys(exactReadings).length + findings.length
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { base64_data, filename, text } = body;

    // 1. Try calling the Python backend OCR service on port 8000 first
    try {
      const pyRes = await fetch('http://127.0.0.1:8000/api/scan_document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64_data, filename, text })
      });

      if (pyRes.ok) {
        const data = await pyRes.json();
        return NextResponse.json(data);
      }
    } catch (e) {
      console.warn("Python OCR server not reachable on :8000, using native parsing engine fallback.");
    }

    // 2. Fallback parsing if text is provided or base64 can be decoded
    let targetText = text || "";
    if (!targetText && base64_data) {
      try {
        const rawB64 = base64_data.includes("base64,") ? base64_data.split("base64,")[1] : base64_data;
        const decoded = Buffer.from(rawB64, 'base64').toString('utf-8');
        // Extract readable ASCII strings from the decoded buffer
        const asciiMatches = decoded.match(/[A-Za-z0-9\s:,\-\.\/]{4,}/g);
        if (asciiMatches) {
          targetText = asciiMatches.join(' ');
        }
      } catch (err) {
        console.error("Failed to decode base64 buffer", err);
      }
    }

    if (!targetText) {
      return NextResponse.json({ error: "No readable document text found to parse." }, { status: 400 });
    }

    const parsed = parseMedicalTextFallback(targetText);
    return NextResponse.json({
      status: "success",
      document_name: filename || "uploaded_report.pdf",
      extracted_data: parsed
    });

  } catch (err: any) {
    console.error("Document scan error:", err);
    return NextResponse.json({ error: err.message || "Failed to scan document" }, { status: 500 });
  }
}
