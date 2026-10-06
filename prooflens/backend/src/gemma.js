import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  REVIEWER_ROLES,
  REVIEWER_SYSTEM_PROMPTS,
  FINAL_JUDGE_SYSTEM_PROMPT,
  buildReviewerUserPrompt,
  buildJudgePrompt
} from './prompts.js';

/**
 * Helper to pause execution for a given number of milliseconds.
 * @param {number} ms
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Checks if an error is a transient error that can be retried.
 * @param {Error|any} error
 * @returns {boolean}
 */
function isTransientError(error) {
  if (!error) return false;
  const msg = String(error.message || error);
  const status = error.status || error.statusCode;
  if ([429, 500, 502, 503, 504].includes(status)) return true;
  return /500|502|503|504|429|demand|high demand|temporar|fetch failed|econnreset|etimedout|network|internal error|service unavailable/i.test(
    msg
  );
}

/**
 * Extracts a concise error summary string for logging (never exposes secrets).
 * @param {Error|any} error
 * @returns {string}
 */
function getErrorSummary(error) {
  if (!error) return 'Unknown error';
  const statusMatch = String(error.message || '').match(/\[(\d{3})[^\]]*\]/);
  if (statusMatch) {
    return `HTTP ${statusMatch[1]}`;
  }
  if (error.status || error.statusCode) {
    return `HTTP ${error.status || error.statusCode}`;
  }
  const msg = String(error.message || error);
  if (msg.includes('503')) return 'HTTP 503';
  if (msg.includes('500')) return 'HTTP 500';
  if (msg.includes('502')) return 'HTTP 502';
  if (msg.includes('429')) return 'HTTP 429';
  return msg.length > 35 ? msg.slice(0, 35) + '...' : msg;
}

/**
 * Executes an async function with retry for transient errors.
 * In demo mode: maxRetries=1, delay 1.5s.
 * In full mode: maxRetries=2, delay 1.8s, then 3.5s.
 * 
 * @param {Function} fn - Async function returning a promise
 * @param {string} label - Log label (e.g., 'solver', 'Final Judge')
 * @param {number} maxRetries - Maximum retry attempts after first failure
 * @param {boolean} isDemoMode - Whether demo mode is active
 * @returns {Promise<any>}
 */
async function executeWithRetry(fn, label, maxRetries = 1, isDemoMode = true) {
  let attempt = 1;
  const totalAttempts = maxRetries + 1;

  while (true) {
    try {
      return await fn();
    } catch (error) {
      if (attempt < totalAttempts && isTransientError(error)) {
        const errorSummary = getErrorSummary(error);
        const delayMs = isDemoMode ? 1500 : (attempt === 1 ? 1800 : 3500);
        console.log(`[RETRY] ${label} attempt ${attempt + 1}/${totalAttempts} after ${errorSummary}`);
        await sleep(delayMs);
        attempt++;
      } else {
        throw error;
      }
    }
  }
}

/**
 * Safely extracts a JSON object from text (supporting pure JSON, code fences, or embedded JSON).
 * @param {string} text
 * @returns {object|null}
 */
function extractJsonObject(text) {
  if (!text || typeof text !== 'string') return null;
  const trimmed = text.trim();

  // 1. Direct JSON parse
  try {
    return JSON.parse(trimmed);
  } catch (_) {}

  // 2. Strip Markdown code fences: ```json ... ``` or ``` ... ```
  const fenceStripped = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  try {
    return JSON.parse(fenceStripped);
  } catch (_) {}

  // 3. Scan for all balanced braces { ... }
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

  // If we found any valid JSON objects, pick one that contains 'verdict' or return the last one
  if (candidates.length > 0) {
    const matching = candidates.find((c) => c && typeof c === 'object' && 'verdict' in c);
    return matching || candidates[candidates.length - 1];
  }

  // 4. Regex fallback match
  const match = trimmed.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      return JSON.parse(match[0]);
    } catch (_) {}
  }

  return null;
}

/**
 * Normalizes verdict to 'correct' | 'incorrect' | 'uncertain'.
 * @param {any} verdict
 * @returns {'correct'|'incorrect'|'uncertain'}
 */
function normalizeVerdict(verdict) {
  const v = typeof verdict === 'string' ? verdict.toLowerCase().trim() : 'uncertain';
  if (['correct', 'incorrect', 'uncertain'].includes(v)) {
    return v;
  }
  return 'uncertain';
}

/**
 * Normalizes confidence to a float between 0.0 and 1.0.
 * @param {any} conf
 * @returns {number}
 */
function normalizeConfidence(conf) {
  let num = typeof conf === 'number' ? conf : parseFloat(conf);
  if (isNaN(num)) num = 0.0;
  return Number(Math.max(0.0, Math.min(1.0, num)).toFixed(2));
}

/**
 * Safely parses reviewer response or generates a structured fallback if non-JSON text was returned.
 * @param {string} rawText
 * @param {string} role
 * @returns {object}
 */
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
      reasoning: rawText.length > 200 ? rawText.slice(0, 200) + '...' : rawText
    };
  }

  return {
    role,
    available: true,
    verdict: normalizeVerdict(parsed.verdict),
    confidence: normalizeConfidence(parsed.confidence),
    first_mistake: parsed.first_mistake || '',
    evidence: parsed.evidence || '',
    reasoning: parsed.reasoning_summary || parsed.reasoning || ''
  };
}

/**
 * Safely parses Final Judge response or generates structured fallback if non-JSON text was returned.
 * @param {string} rawText
 * @param {object} reviewerResults
 * @returns {object}
 */
function parseJudgeResponse(rawText, reviewerResults) {
  const parsed = extractJsonObject(rawText);

  if (!parsed || typeof parsed !== 'object') {
    return {
      verdict: 'uncertain',
      confidence: 0.0,
      first_mistake: 'Final judge returned an unstructured response.',
      evidence: 'Raw judge response was not valid JSON.',
      socratic_hint: 'Re-check the solution carefully against the problem requirements.',
      reasoning_summary: rawText.length > 250 ? rawText.slice(0, 250) + '...' : rawText,
      reviewer_agreement: {
        solver: reviewerResults.solver?.verdict || 'uncertain',
        skeptic: reviewerResults.skeptic?.verdict || 'uncertain',
        visual_inspector: reviewerResults.visual_inspector?.verdict || 'uncertain',
        verifier: reviewerResults.verifier?.verdict || 'uncertain'
      },
      disagreement_summary: 'The final judge output was unstructured.'
    };
  }

  const rawAgreement = parsed.reviewer_agreement || {};
  const reviewerAgreement = {
    solver: rawAgreement.solver ? String(rawAgreement.solver).toLowerCase() : (reviewerResults.solver?.verdict || 'uncertain'),
    skeptic: rawAgreement.skeptic ? String(rawAgreement.skeptic).toLowerCase() : (reviewerResults.skeptic?.verdict || 'uncertain'),
    visual_inspector: rawAgreement.visual_inspector ? String(rawAgreement.visual_inspector).toLowerCase() : (reviewerResults.visual_inspector?.verdict || 'uncertain'),
    verifier: rawAgreement.verifier ? String(rawAgreement.verifier).toLowerCase() : (reviewerResults.verifier?.verdict || 'uncertain')
  };

  return {
    verdict: normalizeVerdict(parsed.verdict),
    confidence: normalizeConfidence(parsed.confidence),
    first_mistake: parsed.first_mistake || '',
    evidence: parsed.evidence || '',
    socratic_hint: parsed.socratic_hint || '',
    reasoning_summary: parsed.reasoning_summary || '',
    reviewer_agreement: reviewerAgreement,
    disagreement_summary: parsed.disagreement_summary || ''
  };
}

/**
 * Executes a single independent reviewer call with retries and timing.
 */
async function executeSingleReviewer({ role, systemPrompt, question, base64Image, mimeType, genAI, modelName, maxRetries, isDemoMode }) {
  const startTime = performance.now();

  try {
    const rawText = await executeWithRetry(async () => {
      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: systemPrompt,
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.1,
          maxOutputTokens: 2048
        }
      });

      const userPrompt = buildReviewerUserPrompt(question);
      const result = await model.generateContent([
        userPrompt,
        {
          inlineData: {
            data: base64Image,
            mimeType: mimeType || 'image/png'
          }
        }
      ]);

      return result.response.text();
    }, role, maxRetries, isDemoMode);

    const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
    console.log(`[REVIEWER] ${role} completed in ${elapsed}s`);

    return parseReviewerResponse(rawText, role);
  } catch (error) {
    const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
    console.warn(`[REVIEWER] ${role} failed after ${elapsed}s: ${getErrorSummary(error)}`);

    return {
      role,
      available: false,
      error: error.message,
      verdict: 'unavailable',
      confidence: 0.0,
      first_mistake: 'Reviewer unavailable',
      evidence: '',
      reasoning: `Reviewer failed to process: ${error.message}`
    };
  }
}

/**
 * Executes the Final Judge call with retries and timing.
 */
async function executeFinalJudge({ question, base64Image, mimeType, reviewerResults, availableCount, genAI, modelName, maxRetries, isDemoMode }) {
  const startTime = performance.now();

  const rawText = await executeWithRetry(async () => {
    const model = genAI.getGenerativeModel({
      model: modelName,
      systemInstruction: FINAL_JUDGE_SYSTEM_PROMPT,
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1,
        maxOutputTokens: 2048
      }
    });

    const judgePrompt = buildJudgePrompt(question, reviewerResults, availableCount);
    const result = await model.generateContent([
      judgePrompt,
      {
        inlineData: {
          data: base64Image,
          mimeType: mimeType || 'image/png'
        }
      }
    ]);

    return result.response.text();
  }, 'Final Judge', maxRetries, isDemoMode);

  const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
  console.log(`[JUDGE] Final Judge completed in ${elapsed}s`);

  return parseJudgeResponse(rawText, reviewerResults);
}

/**
 * Runs tasks with a concurrency limit.
 * @param {Array<Function>} taskFunctions
 * @param {number} concurrency
 * @returns {Promise<Array<any>>}
 */
async function runWithConcurrency(taskFunctions, concurrency = 4) {
  if (concurrency >= taskFunctions.length) {
    return Promise.all(taskFunctions.map((fn) => fn()));
  }

  const results = new Array(taskFunctions.length);
  let currentIndex = 0;

  async function worker() {
    while (currentIndex < taskFunctions.length) {
      const index = currentIndex++;
      results[index] = await taskFunctions[index]();
    }
  }

  const workerCount = Math.min(concurrency, taskFunctions.length);
  const workers = [];
  for (let i = 0; i < workerCount; i++) {
    workers.push(worker());
  }

  await Promise.all(workers);
  return results;
}

/**
 * Runs the Many Tiny Judges pipeline:
 * 1. 4 independent reviewers (concurrency=4 in demo mode, concurrency=2 in full mode).
 * 2. Final Judge to reconcile findings.
 * 
 * @param {Object} params
 * @param {string} params.question - The original question text
 * @param {Buffer} params.imageBuffer - Raw image buffer
 * @param {string} params.mimeType - MIME type of image
 * @returns {Promise<Object>} { success, data } or error structure
 */
export async function runManyTinyJudges({ question, imageBuffer, mimeType }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim() === '' || apiKey.trim() === 'your_gemini_api_key_here') {
    throw new Error('GEMINI_API_KEY is not configured in .env. Please add your Google AI Studio API key.');
  }

  const mode = (process.env.PROOFLENS_MODE || 'demo').toLowerCase();
  const isDemoMode = mode === 'demo';

  // Model selection
  const reviewerModelName =
    process.env.REVIEWER_MODEL ||
    (isDemoMode ? 'gemma-4-26b-a4b-it' : (process.env.GEMMA_MODEL || 'gemma-4-31b-it'));
  const finalJudgeModelName =
    process.env.FINAL_JUDGE_MODEL || process.env.GEMMA_MODEL || 'gemma-4-31b-it';

  // Concurrency and retry settings
  const reviewerConcurrency = isDemoMode ? 4 : 2;
  const maxRetries = isDemoMode ? 1 : 2;

  const genAI = new GoogleGenerativeAI(apiKey);
  const base64Image = imageBuffer.toString('base64');

  // Performance logging headers
  console.log(`\n[PROOF] Mode: ${mode}`);
  console.log(`[PROOF] Reviewer model: ${reviewerModelName}`);
  console.log(`[PROOF] Final Judge model: ${finalJudgeModelName}`);
  console.log(`[PROOF] Reviewer concurrency: ${reviewerConcurrency}`);

  const pipelineStartTime = performance.now();

  // Define the 4 independent reviewer tasks
  const reviewerTasks = [
    () =>
      executeSingleReviewer({
        role: REVIEWER_ROLES.SOLVER,
        systemPrompt: REVIEWER_SYSTEM_PROMPTS[REVIEWER_ROLES.SOLVER],
        question,
        base64Image,
        mimeType,
        genAI,
        modelName: reviewerModelName,
        maxRetries,
        isDemoMode
      }),
    () =>
      executeSingleReviewer({
        role: REVIEWER_ROLES.SKEPTIC,
        systemPrompt: REVIEWER_SYSTEM_PROMPTS[REVIEWER_ROLES.SKEPTIC],
        question,
        base64Image,
        mimeType,
        genAI,
        modelName: reviewerModelName,
        maxRetries,
        isDemoMode
      }),
    () =>
      executeSingleReviewer({
        role: REVIEWER_ROLES.VISUAL_INSPECTOR,
        systemPrompt: REVIEWER_SYSTEM_PROMPTS[REVIEWER_ROLES.VISUAL_INSPECTOR],
        question,
        base64Image,
        mimeType,
        genAI,
        modelName: reviewerModelName,
        maxRetries,
        isDemoMode
      }),
    () =>
      executeSingleReviewer({
        role: REVIEWER_ROLES.VERIFIER,
        systemPrompt: REVIEWER_SYSTEM_PROMPTS[REVIEWER_ROLES.VERIFIER],
        question,
        base64Image,
        mimeType,
        genAI,
        modelName: reviewerModelName,
        maxRetries,
        isDemoMode
      })
  ];

  // Run reviewers in parallel (concurrency 4 in demo mode)
  const [solverRes, skepticRes, visualRes, verifierRes] = await runWithConcurrency(
    reviewerTasks,
    reviewerConcurrency
  );

  const reviewerResults = {
    solver: solverRes,
    skeptic: skepticRes,
    visual_inspector: visualRes,
    verifier: verifierRes
  };

  // Count available (successful or parsed) reviewers
  const availableCount = Object.values(reviewerResults).filter((r) => r.available !== false).length;

  // If ALL reviewers failed, do not attempt Final Judge call
  if (availableCount === 0) {
    const elapsed = ((performance.now() - pipelineStartTime) / 1000).toFixed(1);
    console.warn(`[PROOF] All reviewers failed after ${elapsed}s`);
    return {
      success: false,
      statusCode: 503,
      error: 'AllReviewersUnavailable',
      message: 'All Gemma reviewers were unavailable after retries.',
      data: {
        reviewers: reviewerResults
      }
    };
  }

  // Run Final Judge with retries
  let finalJudgment;
  try {
    finalJudgment = await executeFinalJudge({
      question,
      base64Image,
      mimeType,
      reviewerResults,
      availableCount,
      genAI,
      modelName: finalJudgeModelName,
      maxRetries,
      isDemoMode
    });
  } catch (judgeError) {
    const elapsed = ((performance.now() - pipelineStartTime) / 1000).toFixed(1);
    console.error(`[JUDGE] Final Judge failed after ${elapsed}s:`, judgeError.message);
    return {
      success: false,
      statusCode: 502,
      error: 'FinalJudgeError',
      message: `Final judge failed after retries: ${judgeError.message}`,
      data: {
        reviewers: reviewerResults
      }
    };
  }

  const totalElapsed = ((performance.now() - pipelineStartTime) / 1000).toFixed(1);
  console.log(`[PROOF] Total review time: ${totalElapsed}s\n`);

  return {
    success: true,
    data: {
      final_judgment: finalJudgment,
      reviewers: reviewerResults
    }
  };
}
