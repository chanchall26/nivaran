import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { gemini, geminiApiKey, MODEL, Type } from './gemini';

interface DraftAlertRequest {
  sourceType: string;
  severity: number;
  confidence: number;
  place: string;
  evidenceCount?: number;
}

interface DraftAlertResult {
  en: string;
  hi: string;
  pa: string;
}

const PROMPT = `You are drafting a short alert for a local government pollution-control officer in
India, based on citizen reports gathered by a pollution-reporting app. Write ONE alert message,
translated into three languages: English, Hindi, and Punjabi.

Rules for every language version:
- 2-4 short sentences. State the place, the likely pollution source, and how serious it looks.
- Use simple, everyday words — this is read by field officers, not scientists. No jargon.
- Ask the officer to check the location and take action if needed.
- Keep the same meaning across all three languages.

Facts to include:
- Place: {place}
- Likely source: {sourceType}
- Severity (0 none - 5 severe): {severity}
- How sure the source is correct (0-1): {confidence}
- Number of citizen reports so far: {evidenceCount}`;

export const draftAlert = onCall<DraftAlertRequest>(
  { region: 'asia-south1', enforceAppCheck: true, secrets: [geminiApiKey] },
  async (request): Promise<DraftAlertResult> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in first.');
    }
    const { sourceType, severity, confidence, place, evidenceCount } = request.data ?? {};
    if (typeof place !== 'string' || place.trim().length === 0 || place.length > 120) {
      throw new HttpsError('invalid-argument', 'place is required.');
    }
    if (typeof sourceType !== 'string' || sourceType.length > 60) {
      throw new HttpsError('invalid-argument', 'sourceType is required.');
    }
    if (typeof severity !== 'number' || severity < 0 || severity > 5) {
      throw new HttpsError('invalid-argument', 'severity must be 0-5.');
    }
    if (typeof confidence !== 'number' || confidence < 0 || confidence > 1) {
      throw new HttpsError('invalid-argument', 'confidence must be 0-1.');
    }

    const prompt = PROMPT.replace('{place}', place)
      .replace('{sourceType}', sourceType)
      .replace('{severity}', String(severity))
      .replace('{confidence}', String(confidence))
      .replace('{evidenceCount}', String(evidenceCount ?? 1));

    const response = await gemini().models.generateContent({
      model: MODEL,
      contents: [{ text: prompt }],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            en: { type: Type.STRING },
            hi: { type: Type.STRING },
            pa: { type: Type.STRING },
          },
          required: ['en', 'hi', 'pa'],
        },
        temperature: 0.3,
      },
    });

    const text = response.text;
    if (!text) {
      throw new HttpsError('internal', 'Gemini returned no result.');
    }
    return JSON.parse(text) as DraftAlertResult;
  },
);
