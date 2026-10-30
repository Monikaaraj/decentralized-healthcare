import { NextResponse } from 'next/server';

// Mock dataset metadata for the marketplace
const datasets = [
  {
    id: 'ds001',
    title: 'Hypertension Cohort – 2024',
    description: 'Blood‑pressure readings, age intervals, and medication info (PII masked).',
    price: '0.01 ETH',
    preview: 'Age 45‑55, BP 130/85, ...',
  },
  {
    id: 'ds002',
    title: 'Diabetes Lab Results – Q1 2024',
    description: 'Fasting glucose, HbA1c, and related labs from 500 patients.',
    price: '0.015 ETH',
    preview: 'GLU 110 mg/dL, HbA1c 6.8%, ...',
  },
];

export async function GET() {
  return NextResponse.json(datasets);
}
