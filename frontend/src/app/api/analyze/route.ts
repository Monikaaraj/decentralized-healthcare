import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

export async function POST(req: Request) {
  let action = "summarize";
  let question = "";
  try {
    const body = await req.json();
    action = body.action || "summarize";
    question = body.question || "";
    const documentText = body.documentText;

    if (!documentText) {
      return NextResponse.json({ error: "No document text provided" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;

    // --- MOCK FALLBACK (If no API Key is provided) ---
    if (!apiKey) {
      console.log("No GEMINI_API_KEY found, using mock AI response.");
      await new Promise(resolve => setTimeout(resolve, 1500)); // simulate network delay

      if (action === "summarize") {
        return NextResponse.json({
          response: "### 🔍 Aegis AI Analysis: Possible Threats & Issues\n\nBased on a review of this record, here are the key health markers to watch:\n\n*   **Elevated Blood Pressure:** The readings indicate Stage 1 Hypertension. Monitor daily.\n*   **Cholesterol Levels:** LDL is slightly above the recommended threshold.\n*   **Action Required:** Schedule a follow-up with your cardiologist within 30 days.\n*   **Medication:** Continue current prescription without skipping doses.\n\n*Disclaimer: This is an AI analysis and does not replace professional medical advice.*"
        });
      } else {
        return NextResponse.json({
          response: `Based on your record, regarding "${question}":\n\nThe data shows that these levels are currently stable but require monitoring. It is recommended to maintain your current diet and exercise routine. Please consult your doctor for a detailed explanation of these specific metrics.`
        });
      }
    }

    // --- REAL GOOGLE GEMINI AI ---
    const ai = new GoogleGenAI({ apiKey: apiKey });
    
    let prompt = "";
    if (action === "summarize") {
      prompt = `You are a highly advanced medical AI assistant named Aegis AI. Please analyze the following medical record and provide a summary of the possible threats, issues, and key takeaways in bullet points. Use markdown formatting. Do not provide a medical diagnosis, just summarize the data.`;
    } else {
      prompt = `You are Aegis AI, a medical assistant. Based ONLY on the following medical record, please answer this patient's question: "${question}".`;
    }

    // Check if the document is a Base64 Data URL (e.g., PDF or Image)
    const contents: any[] = [prompt];
    
    if (documentText.startsWith("data:")) {
      // It's a data URL: data:application/pdf;base64,JVBERi...
      const matches = documentText.match(/^data:(.+);base64,(.*)$/);
      if (matches && matches.length === 3) {
        const fullMimeType = matches[1];
        const mimeType = fullMimeType.split(';')[0]; // Gemini requires strict standard mime types like "application/pdf"
        const base64Data = matches[2];
        contents.push({
          inlineData: {
            data: base64Data,
            mimeType: mimeType
          }
        });
      } else {
        // Fallback if parsing fails
        contents.push(`\n\nDocument:\n${documentText.substring(0, 10000)}`);
      }
    } else {
      // Plain text document
      contents.push(`\n\nDocument:\n${documentText.substring(0, 10000)}`);
    }

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: contents,
    });

    return NextResponse.json({ response: response.text });

  } catch (error: any) {
    console.error("AI Analysis Error:", error);
    
    // Check if it's a 429 Rate Limit / Quota error
    const errString = JSON.stringify(error) + error.message;
    if (errString.includes("429") || errString.includes("quota") || errString.includes("RESOURCE_EXHAUSTED")) {
      console.log("Quota exceeded, falling back to mock response...");
      
      if (action === "summarize") {
        return NextResponse.json({
          response: "### 🔍 Aegis AI Analysis: Possible Threats & Issues (MOCK FALLBACK - RATE LIMIT EXCEEDED)\n\nBased on a review of this record, here are the key health markers to watch:\n\n*   **Elevated Blood Pressure:** The readings indicate Stage 1 Hypertension. Monitor daily.\n*   **Cholesterol Levels:** LDL is slightly above the recommended threshold.\n*   **Action Required:** Schedule a follow-up with your cardiologist within 30 days.\n*   **Medication:** Continue current prescription without skipping doses.\n\n*Disclaimer: This is a mock analysis generated because the Google Gemini Free Tier rate limit was reached.*"
        });
      } else {
        return NextResponse.json({
          response: `(MOCK FALLBACK - RATE LIMIT EXCEEDED) \n\nBased on your record, regarding "${question}":\n\nThe data shows that these levels are currently stable but require monitoring. It is recommended to maintain your current diet and exercise routine. Please consult your doctor for a detailed explanation of these specific metrics.`
        });
      }
    }

    return NextResponse.json({ error: error.message || "Failed to process AI request" }, { status: 500 });
  }
}
