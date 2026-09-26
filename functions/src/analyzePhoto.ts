import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { gemini, geminiApiKey, MODEL, Type } from './gemini';

/** Matches the hotspot "sourceType" values stored in Firestore — keep in sync with draftAlert.ts. */
const SOURCE_TYPES = [
  'crop_burning',
  'brick_kiln',
  'garbage_burning',
  'industrial_smoke',
  'vehicle_exhaust',
  'construction_dust',
  'other',
] as const;

// Firestore's `thumb` field caps a base64 photo string at 400,000 chars (~300KB raw); match it here.
const MAX_PHOTO_BASE64_CHARS = 400_000;

interface AnalyzePhotoRequest {
  photoBase64: string;
  mimeType: string;
}

interface AnalyzePhotoResult {
  sourceType: (typeof SOURCE_TYPES)[number];
  severity: number;
  confidence: number;
}

const PROMPT = `You are helping a citizen pollution-reporting app in India. Look at this photo,
which a citizen submitted as evidence of a pollution source (smoke, burning, dust, or similar).

Decide:
- sourceType: the single best match for what is causing the pollution in the photo.
- severity: how bad the pollution looks in this photo, from 0 (no visible pollution) to 5 (severe,
  thick smoke or fire covering most of the frame).
- confidence: how sure you are of your sourceType judgement, from 0 (not sure at all) to 1 (fully sure).

If the photo does not clearly show a pollution source, use sourceType "other" and a low confidence.`;

export const analyzePhoto = onCall<AnalyzePhotoRequest>(
  { region: 'asia-south1', enforceAppCheck: true, secrets: [geminiApiKey] },
  async (request): Promise<AnalyzePhotoResult> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in first.');
    }
    const { photoBase64, mimeType } = request.data ?? {};
    if (typeof photoBase64 !== 'string' || photoBase64.length === 0) {
      throw new HttpsError('invalid-argument', 'photoBase64 is required.');
    }
    if (photoBase64.length > MAX_PHOTO_BASE64_CHARS) {
      throw new HttpsError('invalid-argument', 'Photo is too large.');
    }
    if (typeof mimeType !== 'string' || !mimeType.startsWith('image/')) {
      throw new HttpsError('invalid-argument', 'mimeType must be an image type.');
    }

    const response = await gemini().models.generateContent({
      model: MODEL,
      contents: [
        { inlineData: { data: photoBase64, mimeType } },
        { text: PROMPT },
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            sourceType: { type: Type.STRING, enum: [...SOURCE_TYPES] },
            severity: { type: Type.INTEGER },
            confidence: { type: Type.NUMBER },
          },
          required: ['sourceType', 'severity', 'confidence'],
        },
        temperature: 0.1,
      },
    });

    const text = response.text;
    if (!text) {
      throw new HttpsError('internal', 'Gemini returned no result.');
    }
    const parsed = JSON.parse(text) as AnalyzePhotoResult;
    return {
      sourceType: SOURCE_TYPES.includes(parsed.sourceType) ? parsed.sourceType : 'other',
      severity: Math.max(0, Math.min(5, Math.round(parsed.severity))),
      confidence: Math.max(0, Math.min(1, parsed.confidence)),
    };
  },
);
