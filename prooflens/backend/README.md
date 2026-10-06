# ProofLens Backend — Many Tiny Judges Architecture

ProofLens is an AI-powered multimodal student solution reviewer. This backend implements the **Many Tiny Judges** architecture using Gemma 4 / Gemini via the Google GenAI SDK.

---

## 🏛️ Architecture Overview

When a student solution is submitted via `POST /api/review`:

1. **4 Independent Reviewers** execute with concurrency limit of 2 and exponential backoff retry:
   - **Solver**: Independently solves the problem, understands the ground truth reasoning, and checks the student's work against it.
   - **Skeptic**: Rigorously challenges every step, seeking logical or mathematical flaws without hallucinating errors.
   - **Visual Inspector**: Specializes in handwriting, diagrams, state transitions, crossed-out text, and visual clarity.
   - **Verifier**: Objectively validates claimed errors to avoid false positives.

2. **Final Gemma Judge**:
   - Receives the original question, original image, and all reviewer findings.
   - Reconciles disagreements, validates evidence against the original submission, and issues a final verdict with a pedagogical Socratic hint.

---

## 📁 Project Structure

```
prooflens/
└── backend/
    ├── src/
    │   ├── server.js        # Express app & POST /api/review endpoint
    │   ├── gemma.js         # Concurrency runner, retry, and JSON parsing
    │   └── prompts.js       # Role system prompts & judge prompt builder
    ├── test-data/           # Directory for real test images
    │   └── dfa-solution.png # (Place your real test solution image here)
    ├── .env                 # API keys & config (git-ignored)
    ├── .env.example         # Template for environment variables
    ├── .gitignore           # Git ignore rules
    ├── package.json         # Dependencies and scripts
    ├── test-review.js       # Real-image test script
    └── README.md            # Documentation
```

---

## ⚙️ Prerequisites & Setup

1. **Node.js**: v18+ installed.
2. **Gemini API Key**: Configured in `.env`.

### 1. Install Dependencies
```bash
cd prooflens/backend
npm install
```

### 2. Configure Environment Variables
```env
GEMINI_API_KEY=your_actual_gemini_api_key_here
GEMMA_MODEL=gemma-4-31b-it
PORT=5000
```

---

## 🚀 Running the Backend

### Start Server:
```bash
npm start
```

---

## 🧪 Testing with Real Student Solution Images

1. Place your actual solution image at:
   ```
   backend/test-data/dfa-solution.png
   ```
2. Or point to any image file using `TEST_IMAGE_PATH`:
   ```powershell
   $env:TEST_IMAGE_PATH="C:\path\to\your\solution.png"
   npm run test:review
   ```
3. Run the test script:
   ```powershell
   npm run test:review
   ```
