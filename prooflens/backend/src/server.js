import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { runManyTinyJudges } from './gemma.js';

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS and JSON body parsing
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configure multer for memory storage of uploaded images
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (JPEG, PNG, WEBP, etc.) are allowed.'));
    }
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  const mode = (process.env.PROOFLENS_MODE || 'demo').toLowerCase();
  const isDemoMode = mode === 'demo';
  const reviewerModel =
    process.env.REVIEWER_MODEL ||
    (isDemoMode ? 'gemma-4-26b-a4b-it' : (process.env.GEMMA_MODEL || 'gemma-4-31b-it'));
  const finalJudgeModel =
    process.env.FINAL_JUDGE_MODEL || process.env.GEMMA_MODEL || 'gemma-4-31b-it';
  const reviewerConcurrency = isDemoMode ? 4 : 2;

  res.json({
    status: 'ok',
    mode,
    reviewerModel,
    finalJudgeModel,
    reviewerConcurrency,
    configuredApiKey: Boolean(
      process.env.GEMINI_API_KEY &&
        process.env.GEMINI_API_KEY !== 'your_gemini_api_key_here'
    )
  });
});

/**
 * POST /api/review
 * Accepts multipart/form-data with:
 *  - question: string (text)
 *  - image: file (student's handwritten/visual solution)
 * 
 * Runs 4 independent reviewers (Solver, Skeptic, Visual Inspector, Verifier) with concurrency limit of 2
 * and exponential backoff retry, followed by a Final Judge to reconcile the results.
 */
app.post('/api/review', upload.single('image'), async (req, res) => {
  try {
    const question = req.body?.question?.trim();
    const imageFile = req.file;

    // 1. Validation: both inputs must exist
    if (!question) {
      return res.status(400).json({
        success: false,
        error: 'ValidationFailed',
        message: 'Missing required field: "question" (text).'
      });
    }

    if (!imageFile) {
      return res.status(400).json({
        success: false,
        error: 'ValidationFailed',
        message: 'Missing required file: "image" (student solution image).'
      });
    }

    // 2. Execute Many Tiny Judges multimodal review pipeline
    const reviewResult = await runManyTinyJudges({
      question,
      imageBuffer: imageFile.buffer,
      mimeType: imageFile.mimetype
    });

    if (reviewResult.success === false) {
      const statusCode = reviewResult.statusCode || 500;
      return res.status(statusCode).json({
        success: false,
        error: reviewResult.error || 'ReviewProcessingError',
        message: reviewResult.message || 'An error occurred during review processing.',
        data: reviewResult.data || {}
      });
    }

    // 3. Return structured response
    return res.status(200).json({
      success: true,
      data: reviewResult.data
    });
  } catch (error) {
    console.error('Error during /api/review processing:', error);

    const isApiKeyError = error.message.includes('API_KEY') || error.message.includes('API key');
    const statusCode = isApiKeyError ? 401 : 500;

    return res.status(statusCode).json({
      success: false,
      error: error.name || 'ReviewProcessingError',
      message: error.message || 'An unexpected error occurred while reviewing the solution.'
    });
  }
});

// Global error handler for multer and unexpected errors
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({
      success: false,
      error: 'UploadError',
      message: err.message
    });
  }
  if (err) {
    return res.status(400).json({
      success: false,
      error: 'BadRequest',
      message: err.message
    });
  }
  next();
});

// Start listening
app.listen(PORT, () => {
  console.log(`===========================================`);
  console.log(`🚀 ProofLens Backend (Many Tiny Judges) on port ${PORT}`);
  console.log(`📡 Model target: ${process.env.GEMMA_MODEL || 'gemma-4-31b-it'}`);
  console.log(`🔍 Review endpoint: POST http://localhost:${PORT}/api/review`);
  console.log(`🏥 Health check:   GET  http://localhost:${PORT}/api/health`);
  console.log(`===========================================`);
});
