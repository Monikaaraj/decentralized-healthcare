import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { encryptedData } = body;

    if (!encryptedData) {
      return NextResponse.json({ error: "No data provided" }, { status: 400 });
    }

    const pinataJwt = process.env.PINATA_JWT;
    if (!pinataJwt) {
      return NextResponse.json({ error: "Pinata JWT not configured on server" }, { status: 500 });
    }

    // Wrap the base64 string in a simple JSON object
    const payload = JSON.stringify({
      pinataOptions: {
        cidVersion: 1
      },
      pinataMetadata: {
        name: `MedicalRecord_${Date.now()}`
      },
      pinataContent: {
        encryptedBlob: encryptedData
      }
    });

    const res = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${pinataJwt}`
      },
      body: payload
    });

    const data = await res.json();
    
    if (!res.ok) {
      console.error("Pinata Error:", data);
      return NextResponse.json({ error: "Failed to upload to Pinata" }, { status: 500 });
    }

    // Return the real CID
    return NextResponse.json({ cid: data.IpfsHash });

  } catch (err: any) {
    console.error("IPFS Upload Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
