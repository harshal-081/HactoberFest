import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenerativeAI } from '@google/generative-ai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Resolves the MIME type from the file extension.
 * @param {string} filePath
 * @returns {string}
 */
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
    case '.gif':
      return 'image/gif';
    default:
      return 'image/png';
  }
}

async function runDiagnostic() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim() === '' || apiKey.trim() === 'your_gemini_api_key_here') {
    console.error('[DIAGNOSTIC ERROR] GEMINI_API_KEY is missing or invalid in .env');
    process.exit(1);
  }

  const rawImagePath = process.env.TEST_IMAGE_PATH || './test-data/tm-solution.png';
  const resolvedImagePath = path.isAbsolute(rawImagePath)
    ? rawImagePath
    : path.resolve(__dirname, rawImagePath);

  const modelName = process.env.GEMMA_MODEL || 'gemma-4-31b-it';

  // 1. Verify file existence
  if (!fs.existsSync(resolvedImagePath)) {
    console.error(`[DIAGNOSTIC ERROR] Missing test image at:\n${resolvedImagePath}\n`);
    process.exit(1);
  }

  const fileStats = fs.statSync(resolvedImagePath);
  if (!fileStats.isFile() || fileStats.size === 0) {
    console.error(`[DIAGNOSTIC ERROR] File is empty or invalid: ${resolvedImagePath}\n`);
    process.exit(1);
  }

  const mimeType = getMimeType(resolvedImagePath);
  const imageBuffer = fs.readFileSync(resolvedImagePath);
  const base64Image = imageBuffer.toString('base64');

  const question =
    'Consider the handwritten Turing Machine diagram shown in the image. Carefully inspect the image and describe exactly what is visible. Identify the states, start state, accepting state, transition labels, and the overall structure of the machine. Do not guess anything that is not clearly visible.';

  console.log('========================================================');
  console.log('🧪 ProofLens Single Gemma Multimodal Diagnostic');
  console.log('========================================================\n');
  console.log('Model:');
  console.log(modelName);
  console.log('\nImage:');
  console.log(resolvedImagePath);
  console.log('\nImage size:');
  console.log(`${fileStats.size} bytes`);
  console.log('\nSending ONE Gemma multimodal request...\n');

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: {
      temperature: 0.1
    }
  });

  const startTime = performance.now();

  try {
    const result = await model.generateContent([
      question,
      {
        inlineData: {
          data: base64Image,
          mimeType: mimeType
        }
      }
    ]);

    const endTime = performance.now();
    const totalTimeSec = ((endTime - startTime) / 1000).toFixed(2);
    const responseText = result.response.text();

    console.log('Gemma response:');
    console.log(responseText);
    console.log('\nTotal time:');
    console.log(`${totalTimeSec}s\n`);
  } catch (error) {
    const endTime = performance.now();
    const totalTimeSec = ((endTime - startTime) / 1000).toFixed(2);
    console.error('\n[DIAGNOSTIC REQUEST FAILED]');
    console.error(`Error: ${error.message}`);
    console.error(`Total time: ${totalTimeSec}s\n`);
    process.exit(1);
  }
}

runDiagnostic();
