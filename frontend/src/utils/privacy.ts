/**
 * AEGIS-AI Privacy Masking Utilities
 * PPML Principle: All PII must be de-identified before research data export.
 * 
 * Masking rules applied:
 *  - Age            → 5-yr clinical age bracket (e.g. 19 → "18-22")
 *  - Name           → "Patient [REDACTED]"
 *  - DOB            → Birth year only
 *  - Phone/Email    → "[REDACTED]"
 *  - Address        → "[REDACTED]"
 *  - Wallet address → first6...last4 (pseudonymised)
 *  - SSN / Govt ID  → "[REDACTED]"
 *  - Blood Pressure → Rounded to nearest 10mmHg band
 */

// ── Age bucketing (matches clinical population groupings) ──────────────────
export function maskAge(age: number): string {
  if (age <  5)  return "0-4";
  if (age < 13)  return "5-12";
  if (age < 18)  return "13-17";
  if (age < 23)  return "18-22";   // user's example: 19 → "18-22"
  if (age < 31)  return "23-30";
  if (age < 41)  return "31-40";
  if (age < 51)  return "41-50";
  if (age < 61)  return "51-60";
  if (age < 71)  return "61-70";
  if (age < 81)  return "71-80";
  return "80+";
}

// ── Wallet / blockchain address pseudonymisation ──────────────────────────
export function maskWalletAddress(address: string): string {
  if (!address || address.length < 10) return "[REDACTED]";
  return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
}

// ── Direct PII ─────────────────────────────────────────────────────────────
export function maskName():  string { return "Patient [REDACTED]"; }
export function maskPhone(): string { return "[REDACTED]"; }
export function maskEmail(): string { return "[REDACTED]"; }
export function maskAddr():  string { return "[REDACTED]"; }
export function maskId():    string { return "[REDACTED]"; }

// ── DOB → year only ───────────────────────────────────────────────────────
export function maskDOB(dob: string): string {
  try {
    const year = new Date(dob).getFullYear();
    return isNaN(year) ? "[REDACTED]" : String(year);
  } catch {
    return "[REDACTED]";
  }
}

// ── Blood Pressure → 10 mmHg band ─────────────────────────────────────────
// e.g. "125/82" → "120-130 / 80-90 mmHg"
export function maskBloodPressure(bp: string): string {
  if (!bp) return bp;
  const parts = bp.split("/");
  if (parts.length !== 2) return bp;
  const s  = parseInt(parts[0]);
  const d  = parseInt(parts[1]);
  if (isNaN(s) || isNaN(d)) return bp;
  const sL = Math.floor(s / 10) * 10;
  const dL = Math.floor(d / 10) * 10;
  return `${sL}-${sL + 10} / ${dL}-${dL + 10} mmHg`;
}

// ── Glucose → 10 mg/dL band ───────────────────────────────────────────────
export function maskGlucose(g: number): string {
  const low = Math.floor(g / 10) * 10;
  return `${low}-${low + 10} mg/dL`;
}

// ── Heart rate → 5 bpm band ───────────────────────────────────────────────
export function maskHeartRate(hr: number): string {
  const low = Math.floor(hr / 5) * 5;
  return `${low}-${low + 5} bpm`;
}

// ── Generic record anonymiser ──────────────────────────────────────────────
// Inspects key names and applies the appropriate masking function.
export function anonymizeRecord(record: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(record)) {
    const lk = key.toLowerCase();

    if (lk === "age" && typeof value === "number") {
      out[key] = maskAge(value);

    } else if (lk.includes("name") || lk.includes("firstname") || lk.includes("lastname")) {
      out[key] = maskName();

    } else if (lk.includes("phone") || lk.includes("mobile") || lk.includes("tel")) {
      out[key] = maskPhone();

    } else if (lk.includes("email")) {
      out[key] = maskEmail();

    } else if ((lk.includes("address") || lk.includes("addr")) && !lk.includes("wallet")) {
      out[key] = maskAddr();

    } else if (lk.includes("dob") || lk.includes("birthdate") || lk.includes("dateofbirth")) {
      out[key] = maskDOB(String(value));

    } else if (lk === "patient" || lk === "walletaddress" || lk === "patient_id") {
      out[key] = maskWalletAddress(String(value));

    } else if (lk.includes("ssn") || lk.includes("govtid") || lk.includes("national_id")) {
      out[key] = maskId();

    } else if ((lk.includes("blood_pressure") || lk.includes("bp")) && typeof value === "string") {
      out[key] = maskBloodPressure(value);

    } else if (lk === "glucose" && typeof value === "number") {
      out[key] = maskGlucose(value);

    } else if (lk === "heart_rate" && typeof value === "number") {
      out[key] = maskHeartRate(value);

    } else {
      out[key] = value;
    }
  }

  return out;
}
