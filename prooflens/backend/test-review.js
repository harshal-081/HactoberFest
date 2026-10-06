import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Resolves the MIME type from the file extension.
 * @param {string} filePath
 * @returns {string|null}
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
      return null;
  }
}

async function runTest() {
  const port = process.env.PORT || 5000;
  const baseUrl = `http://localhost:${port}`;

  // 1. Resolve and validate the test image file
  const rawImagePath = process.env.TEST_IMAGE_PATH || './test-data/tm-solution.png';
  const resolvedImagePath = path.isAbsolute(rawImagePath)
    ? rawImagePath
    : path.resolve(__dirname, rawImagePath);

  console.log('========================================================');
  console.log('🧪 ProofLens: Testing Many Tiny Judges Architecture (Evaluation #1)');
  console.log('========================================================\n');

  // Verify file existence
  if (!fs.existsSync(resolvedImagePath)) {
    console.error(`[TEST ERROR] Missing test image:\n${resolvedImagePath}\n`);
    console.error('To run this test with a real multimodal student solution:');
    console.error('1. Place your solution image at:');
    console.error(`   ${path.resolve(__dirname, 'test-data', 'tm-solution.png')}`);
    console.error('2. OR provide a custom path via environment variable:');
    console.error('   $env:TEST_IMAGE_PATH="C:\\path\\to\\your\\solution.png"');
    console.error('   npm run test:review\n');
    process.exit(1);
  }

  // Verify file stats and size
  const fileStats = fs.statSync(resolvedImagePath);
  if (!fileStats.isFile() || fileStats.size === 0) {
    console.error(`[TEST ERROR] Invalid or empty image file: ${resolvedImagePath} (${fileStats.size} bytes)\n`);
    process.exit(1);
  }

  // Determine and validate MIME type
  const mimeType = getMimeType(resolvedImagePath);
  if (!mimeType) {
    console.error(`[TEST ERROR] Unsupported image format for ${resolvedImagePath}. Please use PNG, JPEG, or WebP.\n`);
    process.exit(1);
  }

  // Read actual image buffer
  const imageBuffer = fs.readFileSync(resolvedImagePath);

  // 2. Health check
  try {
    const healthRes = await fetch(`${baseUrl}/api/health`);
    const healthData = await healthRes.json();
    console.log('📡 Health Check Response:', healthData);
  } catch (err) {
    console.error('❌ Could not connect to server at', baseUrl, 'Is it running? Error:', err.message);
    process.exit(1);
  }

  // 3. Question and Image Details
  const question =
    process.env.TEST_QUESTION ||
    'Design a Turing Machine that increments a given binary number by 1. Demonstrate the operation for the following two inputs.';

  console.log('\n📝 Question:');
  console.log(question);
  console.log(`\n🖼️ Test Image: ${resolvedImagePath}`);
  console.log(`📦 Image Size: ${fileStats.size} bytes`);
  console.log(`📷 MIME Type:  ${mimeType}`);
  console.log('\n⏳ Dispatching reviewers (concurrency: 2) + Final Judge...\n');

  const blob = new Blob([imageBuffer], { type: mimeType });
  const filename = path.basename(resolvedImagePath);

  const formData = new FormData();
  formData.append('question', question);
  formData.append('image', blob, filename);

  const startTime = performance.now();

  try {
    const res = await fetch(`${baseUrl}/api/review`, {
      method: 'POST',
      body: formData
    });

    const endTime = performance.now();
    const totalExecutionTimeSec = ((endTime - startTime) / 1000).toFixed(2);
    const data = await res.json();

    console.log(`⏱️ Total Execution Time: ${totalExecutionTimeSec}s\n`);
    console.log(`HTTP Status: ${res.status}`);

    if (!data.success) {
      console.log('⚠️ Response returned non-success status:');
      console.log(JSON.stringify(data, null, 2));
      return;
    }

    const { final_judgment, reviewers } = data.data;

    // Print Each Reviewer Result
    console.log('--------------------------------------------------------');
    console.log('👥 INDEPENDENT REVIEWERS RESULTS (Concurrency: 2)');
    console.log('--------------------------------------------------------');

    for (const [roleName, reviewerResult] of Object.entries(reviewers)) {
      const isAvail = reviewerResult.available !== false;
      console.log(`\n🔍 [${roleName.toUpperCase()}] ${isAvail ? '✅ Available' : '❌ Unavailable'}`);
      console.log(`  - Verdict:       ${reviewerResult.verdict}`);
      console.log(`  - Confidence:    ${reviewerResult.confidence}`);
      console.log(`  - First Mistake: ${reviewerResult.first_mistake || 'None noted'}`);
      console.log(`  - Evidence:      ${reviewerResult.evidence || 'N/A'}`);
      console.log(`  - Reasoning:     ${reviewerResult.reasoning || reviewerResult.reasoning_summary || 'N/A'}`);
      if (reviewerResult.raw_response) {
        console.log(`  - Raw Response:  ${reviewerResult.raw_response}`);
      }
    }

    // Print Final Judge Result
    if (final_judgment) {
      console.log('\n========================================================');
      console.log('⚖️ FINAL JUDGE RECONCILIATION RESULT');
      console.log('========================================================');
      console.log(`- Verdict:             ${final_judgment.verdict}`);
      console.log(`- Confidence:          ${final_judgment.confidence}`);
      console.log(`- First Mistake:       ${final_judgment.first_mistake || 'None'}`);
      console.log(`- Evidence:            ${final_judgment.evidence || 'N/A'}`);
      console.log(`- Socratic Hint:       ${final_judgment.socratic_hint || 'N/A'}`);
      console.log(`- Reasoning Summary:   ${final_judgment.reasoning_summary || 'N/A'}`);
      console.log(`- Reviewer Agreement: `, JSON.stringify(final_judgment.reviewer_agreement, null, 2));
      console.log(`- Disagreement Summary: ${final_judgment.disagreement_summary || 'None'}`);
      console.log('========================================================\n');
    }
  } catch (err) {
    console.error('❌ Request failed:', err.message);
  }
}

runTest();
