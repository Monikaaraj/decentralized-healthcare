import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const cid = searchParams.get("cid");

    if (!cid) {
      return NextResponse.json({ error: "CID is required" }, { status: 400 });
    }

    // We fetch from the public Pinata gateway (or a dedicated one if configured)
    const gateway = process.env.PINATA_GATEWAY || "gateway.pinata.cloud";
    const res = await fetch(`https://${gateway}/ipfs/${cid}`);

    if (!res.ok) {
      return NextResponse.json({ error: "Failed to fetch from IPFS gateway" }, { status: 500 });
    }

    const data = await res.json();
    
    // Return the decrypted blob we originally pinned
    return NextResponse.json({ data: data.encryptedBlob });

  } catch (err: any) {
    console.error("IPFS Download Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
