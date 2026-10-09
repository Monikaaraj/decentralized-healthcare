import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

export async function POST(req: Request) {
  try {
    const { query } = await req.json();

    if (!query || query.length < 2) {
      return NextResponse.json({ suggestions: [] });
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      // Mock fallback
      const mocks = ["Paracetamol", "Panadol", "Pantoprazole", "Penicillin", "Amoxicillin", "Aspirin", "Azithromycin"];
      const filtered = mocks.filter(m => m.toLowerCase().includes(query.toLowerCase()));
      return NextResponse.json({ suggestions: filtered.slice(0, 5) });
    }

    const ai = new GoogleGenAI({ apiKey: apiKey });
    
    const prompt = `You are a medical autocomplete assistant. The user is typing the name of a medicine: "${query}". 
Provide a list of up to 5 real, common medicine names that match or start with this string.
Return EXACTLY a comma-separated list of names and NOTHING else. Do not use quotes or bullet points.
Example output: Paracetamol, Pantoprazole, Penicillin`;

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
    });

    const text = response.text || "";
    // Split by comma, trim whitespace, and filter out empty strings
    const suggestions = text.split(",").map((s: string) => s.trim()).filter((s: string) => s.length > 0).slice(0, 5);

    return NextResponse.json({ suggestions });

  } catch (error: any) {
    console.error("AI Suggestion Error:", error);
    return NextResponse.json({ suggestions: [] }); // Fail gracefully for autocomplete
  }
}
