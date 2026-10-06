import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  REVIEWER_ROLES,
  REVIEWER_SYSTEM_PROMPTS,
  buildReviewerUserPrompt
} from './src/prompts.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    default:
      return 'image/png';
  }
}

// Multi-pass extractor mirroring gemma.js
function extractJsonObject(text) {
  if (!text || typeof text !== 'string') return null;
  const trimmed = text.trim();

  try {
    return JSON.parse(trimmed);
  } catch (_) {}

  const fenceStripped = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  try {
    return JSON.parse(fenceStripped);
  } catch (_) {}

  const candidates = [];
  let depth = 0;
  let inString = false;
  let escape = false;
  let startIndex = -1;

  for (let i = 0; i < trimmed.length; i++) {
    const char = trimmed[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (char === '\\') {
      escape = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (char === '{') {
        if (depth === 0) startIndex = i;
        depth++;
      } else if (char === '}') {
        depth--;
        if (depth === 0 && startIndex !== -1) {
          const candidateStr = trimmed.substring(startIndex, i + 1);
          try {
            const parsed = JSON.parse(candidateStr);
            if (parsed && typeof parsed === 'object') {
              candidates.push(parsed);
            }
          } catch (_) {}
          startIndex = -1;
        }
      }
    }
  }

  if (candidates.length > 0) {
    const matching = candidates.find((c) => c && typeof c === 'object' && 'verdict' in c);
    return matching || candidates[candidates.length - 1];
  }

  const match = trimmed.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      return JSON.parse(match[0]);
    } catch (_) {}
  }

  return null;
}

function normalizeVerdict(verdict) {
  const v = typeof verdict === 'string' ? verdict.toLowerCase().trim() : 'uncertain';
  if (['correct', 'incorrect', 'uncertain'].includes(v)) {
    return v;
  }
  return 'uncertain';
}

function normalizeConfidence(conf) {
  let num = typeof conf === 'number' ? conf : parseFloat(conf);
  if (isNaN(num)) num = 0.0;
  return Number(Math.max(0.0, Math.min(1.0, num)).toFixed(2));
}

function parseReviewerResponse(rawText, role) {
  const parsed = extractJsonObject(rawText);

  if (!parsed || typeof parsed !== 'object') {
    return {
      role,
      available: true,
      verdict: 'uncertain',
      confidence: 0.0,
      first_mistake: 'Reviewer returned an unstructured response.',
      evidence: 'Raw reviewer response was not valid JSON.',
      reasoning: rawText.length > 400 ? rawText.slice(0, 400) + '...' : rawText,
      raw_response: rawText.length > 500 ? rawText.slice(0, 500) + '...' : rawText
    };
  }

  return {
    role,
    available: true,
    verdict: normalizeVerdict(parsed.verdict),
    confidence: normalizeConfidence(parsed.confidence),
    first_mistake: parsed.first_mistake || '',
    evidence: parsed.evidence || '',
    reasoning: parsed.reasoning || parsed.reasoning_summary || ''
  };
}

async function runSingleRoleDiagnostic(role) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim() === '') {
    console.error(`[DIAGNOSTIC ERROR] Missing GEMINI_API_KEY`);
    return;
  }

  const imagePath = path.resolve(__dirname, 'test-data', 'tm-solution.png');
  if (!fs.existsSync(imagePath)) {
    console.error(`[DIAGNOSTIC ERROR] Missing test image at: ${imagePath}`);
    return;
  }

  const fileStats = fs.statSync(imagePath);
  const mimeType = getMimeType(imagePath);
  const imageBuffer = fs.readFileSync(imagePath);
  const base64Image = imageBuffer.toString('base64');

  const question =
    'Design a Turing Machine that increments a given binary number by 1. Demonstrate the operation for the following two inputs.';

  const modelName = process.env.GEMMA_MODEL || 'gemma-4-31b-it';
  const systemPrompt = REVIEWER_SYSTEM_PROMPTS[role];
  const userPrompt = buildReviewerUserPrompt(question);

  console.log(`\n==================================================`);
  console.log(`ROLE: ${role.toUpperCase()}`);
  console.log(`==================================================`);
  console.log(`Request information:`);
  console.log(`- Model: ${modelName}`);
  console.log(`- Image Path: ${imagePath}`);
  console.log(`- Image MIME type: ${mimeType}`);
  console.log(`- Image byte size: ${fileStats.size} bytes`);
  console.log(`- Base64 string length: ${base64Image.length} characters`);
  console.log(`- System prompt length: ${systemPrompt.length} characters`);
  console.log(`- User prompt length: ${userPrompt.length} characters`);

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: systemPrompt,
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.2
    }
  });

  const startTime = performance.now();

  try {
    const result = await model.generateContent([
      userPrompt,
      {
        inlineData: {
          data: base64Image,
          mimeType: mimeType
        }
      }
    ]);

    const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
    const rawText = result.response.text();

    console.log(`\nRaw Gemma output (Latency: ${elapsed}s):`);
    console.log(`--------------------------------------------------`);
    console.log(rawText);
    console.log(`--------------------------------------------------`);

    const parsed = parseReviewerResponse(rawText, role);
    console.log(`\nParsed result:`);
    console.log(JSON.stringify(parsed, null, 2));
  } catch (error) {
    const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
    console.error(`\n[ROLE FAILED after ${elapsed}s]: ${error.message}`);
  }
}

async function main() {
  console.log(`🧪 STARTING SINGLE-ROLE DIAGNOSTICS (Solver & Visual Inspector)`);

  // Run Solver alone
  await runSingleRoleDiagnostic(REVIEWER_ROLES.SOLVER);

  // Pause briefly
  await new Promise((r) => setTimeout(r, 2000));

  // Run Visual Inspector alone
  await runSingleRoleDiagnostic(REVIEWER_ROLES.VISUAL_INSPECTOR);

  console.log(`\n🧪 DIAGNOSTIC RUN COMPLETED.`);
}

main();
