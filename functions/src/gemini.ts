import { GoogleGenAI, Type } from '@google/genai';
import { defineSecret, defineString } from 'firebase-functions/params';

export const geminiApiKey = defineSecret('GEMINI_API_KEY');
// Same model family the web app requests via VITE_GEMINI_MODEL (web/.env.example) — keep in sync.
const geminiModel = defineString('GEMINI_MODEL', { default: 'gemini-3-flash-preview' });

const MODEL = geminiModel.value();

let client: GoogleGenAI | undefined;

export function gemini(): GoogleGenAI {
  if (!client) {
    client = new GoogleGenAI({ apiKey: geminiApiKey.value() });
  }
  return client;
}

export { MODEL, Type };
