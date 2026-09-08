import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  const statePath = path.join(process.cwd(), 'src/app/api/fl/state.json');
  let flStatus = { status: "idle", rounds: [] as any[] };
  
  try {
    if (fs.existsSync(statePath)) {
      flStatus = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    }
  } catch (e) {}

  if (flStatus.status === "training") {
    const nextRound = flStatus.rounds.length + 1;
    if (nextRound <= 5) {
      flStatus.rounds.push({
        round: nextRound,
        accuracy: 0.50 + (nextRound * 0.08) + (Math.random() * 0.02)
      });
    } else {
      flStatus.status = "completed";
    }
    fs.writeFileSync(statePath, JSON.stringify(flStatus));
  }

  return NextResponse.json(flStatus);
}
