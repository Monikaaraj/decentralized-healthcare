import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function POST() {
  const statePath = path.join(process.cwd(), 'src/app/api/fl/state.json');
  const newState = { status: "training", rounds: [] };
  
  try {
    fs.writeFileSync(statePath, JSON.stringify(newState));
  } catch (e) {
    console.error(e);
  }

  return NextResponse.json({ success: true });
}
