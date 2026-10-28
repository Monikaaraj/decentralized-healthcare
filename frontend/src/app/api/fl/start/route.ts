import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function POST() {
  try {
    const FL_API = process.env.FL_API_URL ?? 'http://127.0.0.1:8000';
    const res = await fetch(`${FL_API}/start_simulation?num_rounds=3`, {
      method: 'POST'
    });
    if (res.ok) {
      return NextResponse.json({ success: true, mode: "real_fl_engine" });
    }
  } catch (err) {
    console.warn("Federated Engine on :8000 not reachable, using fallback", err);
  }

  // Fallback to local state if engine is offline
  const statePath = path.join(process.cwd(), 'src/app/api/fl/state.json');
  const newState = { status: "training", rounds: [] };
  try {
    fs.writeFileSync(statePath, JSON.stringify(newState));
  } catch (e) {
    console.error(e);
  }

  return NextResponse.json({ success: true, mode: "fallback" });
}
