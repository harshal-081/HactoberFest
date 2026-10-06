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

function isTransientError(error) {
  if (!error) return false;
  const msg = String(error.message || error);
  const status = error.status || error.statusCode;
  if ([429, 500, 502, 503, 504].includes(status)) return true;
  return /500|502|503|504|429|demand|high demand|temporar|fetch failed|econnreset|etimedout|network|internal error|service unavailable/i.test(
    msg
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function executeWithRetry(fn, label, maxRetries = 2) {
  let attempt = 1;
  const totalAttempts = maxRetries + 1;

  while (true) {
    try {
      return await fn();
    } catch (error) {
      if (attempt < totalAttempts && isTransientError(error)) {
        const delayMs = attempt === 1 ? 3000 : 6000;
        console.log(`[RETRY] ${label} attempt ${attempt + 1}/${totalAttempts} after error: ${error.message}`);
        await sleep(delayMs);
        attempt++;
      } else {
        throw error;
      }
    }
  }
}

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
      reasoning: rawText.length > 400 ? rawText.slice(0, 400) + '...' : rawText
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

async function runSingleCall(role, runIndex) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim() === '') {
    console.error(`[DIAGNOSTIC ERROR] Missing GEMINI_API_KEY`);
    return { error: 'Missing GEMINI_API_KEY' };
  }

  const imagePath = path.resolve(__dirname, 'test-data', 'tm-solution.png');
  const fileStats = fs.statSync(imagePath);
  const mimeType = getMimeType(imagePath);
  const imageBuffer = fs.readFileSync(imagePath);
  const base64Image = imageBuffer.toString('base64');

  const question =
    'Design a Turing Machine that increments a given binary number by 1. Demonstrate the operation for the following two inputs.';

  const modelName = process.env.GEMMA_MODEL || 'gemma-4-31b-it';
  const systemPrompt = REVIEWER_SYSTEM_PROMPTS[role];
  const userPrompt = buildReviewerUserPrompt(question);

  console.log(`\n⏳ Executing [${role.toUpperCase()}] Run #${runIndex}...`);

  const genAI = new GoogleGenerativeAI(apiKey);
  const startTime = performance.now();

  try {
    const rawText = await executeWithRetry(async () => {
      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: systemPrompt,
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.1
        }
      });

      const result = await model.generateContent([
        userPrompt,
        {
          inlineData: {
            data: base64Image,
            mimeType: mimeType
          }
        }
      ]);

      return result.response.text();
    }, `${role} Run #${runIndex}`, 2);

    const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
    const parsed = parseReviewerResponse(rawText, role);

    console.log(`✅ [${role.toUpperCase()}] Run #${runIndex} completed in ${elapsed}s`);
    return parsed;
  } catch (error) {
    const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
    console.warn(`⚠️ [${role.toUpperCase()}] Run #${runIndex} failed in ${elapsed}s: ${error.message}`);
    return {
      role,
      available: false,
      error: error.message,
      verdict: 'unavailable',
      confidence: 0.0,
      first_mistake: 'Reviewer unavailable',
      evidence: '',
      reasoning: error.message
    };
  }
}

async function main() {
  console.log('========================================================');
  console.log('🧪 ProofLens: Reviewer Consistency Diagnostic');
  console.log('========================================================\n');

  // Solver Run 1 & 2
  const solverRun1 = await runSingleCall(REVIEWER_ROLES.SOLVER, 1);
  await sleep(2500);
  const solverRun2 = await runSingleCall(REVIEWER_ROLES.SOLVER, 2);
  await sleep(2500);

  // Visual Inspector Run 1 & 2
  const visualRun1 = await runSingleCall(REVIEWER_ROLES.VISUAL_INSPECTOR, 1);
  await sleep(2500);
  const visualRun2 = await runSingleCall(REVIEWER_ROLES.VISUAL_INSPECTOR, 2);

  console.log('\n========================================================');
  console.log('📊 RESULTS SUMMARY');
  console.log('========================================================\n');

  console.log('--- SOLVER RUN 1 ---');
  console.log(JSON.stringify(solverRun1, null, 2));
  console.log('\n--- SOLVER RUN 2 ---');
  console.log(JSON.stringify(solverRun2, null, 2));

  console.log('\n--- VISUAL INSPECTOR RUN 1 ---');
  console.log(JSON.stringify(visualRun1, null, 2));
  console.log('\n--- VISUAL INSPECTOR RUN 2 ---');
  console.log(JSON.stringify(visualRun2, null, 2));

  // Consistency evaluation
  const solverConsistent =
    solverRun1.available !== false &&
    solverRun2.available !== false &&
    solverRun1.verdict === solverRun2.verdict;

  const visualConsistent =
    visualRun1.available !== false &&
    visualRun2.available !== false &&
    visualRun1.verdict === visualRun2.verdict;

  console.log('\n========================================================');
  console.log(`Solver consistency:            ${solverConsistent ? 'CONSISTENT' : 'INCONSISTENT'}`);
  console.log(`Visual Inspector consistency:  ${visualConsistent ? 'CONSISTENT' : 'INCONSISTENT'}`);
  console.log('========================================================\n');
}

main();
