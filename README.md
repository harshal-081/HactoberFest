# ProofLens

> **Multimodal AI Second Opinion for Student Solutions**

ProofLens is an AI-powered evaluation tool designed to review handwritten and visual academic solutions using the **Many Tiny Judges** architecture powered by **Gemma 4**.

---

## 📌 The Problem

When students submit handwritten or diagrammatic work—such as automata state diagrams, Turing Machines, DFA/PDA derivations, mathematical proofs, or flowcharts—evaluating their correctness is challenging:
- A single general-purpose AI model often misses subtle handwriting nuances.
- Models may misread ambiguous characters (such as handwritten `L` vs. `R` on transition arrows).
- Monolithic AI reviewers frequently suffer from overconfidence or silent "auto-repair", incorrectly assuming the student intended the right answer rather than evaluating what is visibly drawn.

## 💡 The ProofLens Solution

ProofLens replaces monolithic AI grading with a panel of **four independent, specialized Gemma 4 reviewers** operating under distinct analytical personas, reconciled by a **Final Judge**:

```
                  Question + Solution Image
                              ↓
             ┌────────────────┼────────────────┐
             ↓                ↓                ↓
          Solver           Skeptic      Visual Inspector
             │                │                │
             └────────────────┼────────────────┘
                              ↓
                          Verifier
                              ↓
                         Final Judge
                              ↓
                Verdict + Literal Evidence
                    + Socratic Hint
```

---

## 🏛️ The "Many Tiny Judges" Architecture

Every reviewer independently inspects the exact same problem statement and handwritten image, but each evaluates it through a strictly defined lens:

### 1. 🧠 Solver
- **Role**: Independently computes the mathematically sound solution first, then strictly evaluates the student's visible work against that expected logic.
- **Rule**: Does not silently repair or autocorrect student errors.

### 2. 🧐 Skeptic
- **Role**: A rigorous critic that actively tests edge cases and searches for genuine logical, conceptual, or directional flaws without inventing false errors.

### 3. 👁️ Visual Inspector
- **Role**: Specialist in literal visual image transcription. Identifies states, arrows, symbols, and directions step-by-step.
- **Rule**: Never alters its transcription simply because a different reading would make the math correct. Explicitly flags visual ambiguities (e.g., ambiguous handwritten characters) with calibrated confidence scores.

### 4. 🛡️ Verifier
- **Role**: Objective validator that checks whether claimed mistakes are genuinely supported by the image evidence, filtering out false positives.

### ⚖️ Final Judge
- **Role**: Synthesizes the findings from all available reviewers and inspects the original image directly. Reconciles evidence and disagreements rather than blindly following a majority vote.
- **Output**: Issues an overall verdict (`correct`, `incorrect`, `uncertain`), cites literal visual evidence, and generates a pedagogical **Socratic Hint**.

---

## 💡 Socratic Feedback

ProofLens is designed for education: rather than immediately giving away the direct answer, it provides a guided **Socratic Hint** to prompt student discovery.

* **Example direct fix (avoided):** *"Change B → B, R to B → B, L on state q0."*
* **ProofLens Socratic Hint:** *"Think about where the tape head should be positioned after reaching the rightmost blank before you begin modifying the binary digits."*

---

## 🤖 AI Models Used

* **Reviewer Model (Fast Demo Mode)**: `gemma-4-26b-a4b-it`
  - Powers the 4 parallel reviewer roles (Solver, Skeptic, Visual Inspector, Verifier).
* **Final Judge Model**: `gemma-4-31b-it`
  - Powers evidence reconciliation and final verdict synthesis.
* **Full Evaluation Mode (Configurable)**: `gemma-4-31b-it` across all roles.
* **Provider**: Google Gemini API via official `@google/generative-ai` SDK.

*All four reviewers are independent API calls with role-specific system prompts; API keys remain securely on the backend.*

---

## ⚡ Fast Demo Mode & Latency Optimization

To deliver responsive evaluations during live presentations while preserving the complete multi-judge pipeline, ProofLens includes a **Fast Demo Mode**:

| Feature | Full Mode | Fast Demo Mode |
| :--- | :--- | :--- |
| **Reviewer Model** | `gemma-4-31b-it` | `gemma-4-26b-a4b-it` |
| **Reviewer Concurrency** | 2 | **4 (All in parallel)** |
| **Final Judge Model** | `gemma-4-31b-it` | `gemma-4-31b-it` |
| **Retry Strategy** | 2 retries with backoff | 1 short retry (1.5s) |
| **Measured Benchmark** | **~272.84s** | **~91.97s** (~66.3% faster) |

*(Note: Benchmark times are recorded test measurements under standard network conditions; actual latency may vary with Google API load).*

---

## 🛠️ Tech Stack

### Frontend
- **Framework**: React 18 + Vite
- **Styling**: Plain CSS (accessible contrast, modern typography, responsive 2x2 reviewer grid)

### Backend
- **Runtime**: Node.js (ES Modules)
- **Framework**: Express 4
- **Multipart Uploads**: Multer (in-memory buffer processing)
- **Environment**: dotenv, cors
- **AI SDK**: `@google/generative-ai` (Google GenAI SDK)

---

## 📁 Project Structure

```
prooflens/
├── backend/
│   ├── src/
│   │   ├── server.js              # Express API server & routes
│   │   ├── gemma.js               # Multi-reviewer pipeline & Judge logic
│   │   └── prompts.js             # Reviewer & Judge system prompts
│   ├── test-data/
│   │   ├── tm-solution.png        # Real handwritten Turing Machine test image
│   │   └── README.md
│   ├── test-review.js             # End-to-end Many Tiny Judges benchmark script
│   ├── test-single.js             # Single-reviewer diagnostic script
│   ├── test-review-consistency.js # Reviewer consistency verification script
│   ├── .env.example               # Backend environment variables template
│   ├── .gitignore
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx                # Single-page evaluation UI & Socratic view
│   │   ├── index.css              # Custom responsive stylesheet
│   │   └── main.jsx
│   ├── index.html
│   ├── vite.config.js
│   ├── .gitignore
│   └── package.json
│
├── .gitignore
└── README.md
```

---

## 🚀 Installation & Setup

### Prerequisites
- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher
- **Google Gemini API Key**: Obtainable from [Google AI Studio](https://aistudio.google.com/)

---

### Step 1: Clone the Repository

```bash
git clone https://github.com/harshal-081/HactoberFest.git
cd HactoberFest/prooflens
```

---

### Step 2: Configure and Start the Backend

```bash
cd backend
npm install
```

Create `.env` based on `.env.example`:

```bash
cp .env.example .env
```

Edit `backend/.env` with your API key and configuration:

```env
# Google Gemini API Key
GEMINI_API_KEY=your_actual_gemini_api_key_here

# Mode: 'demo' (fast parallel) or 'full'
PROOFLENS_MODE=demo
REVIEWER_MODEL=gemma-4-26b-a4b-it
FINAL_JUDGE_MODEL=gemma-4-31b-it

# Server Port
PORT=5000
```

Start the backend server:

```bash
npm start
```

The backend will start at `http://localhost:5000`.

---

### Step 3: Start the Frontend

In a second terminal window:

```bash
cd ../frontend
npm install
npm run dev
```

Open your browser at `http://localhost:5173`.

---

## 🖥️ Running Locally

ProofLens runs locally on your machine with cloud-hosted Gemma multimodal inference:

* **Frontend UI**: `http://localhost:5173`
* **Backend API**: `http://localhost:5000`
* **Health Check**: `http://localhost:5000/api/health`

---

## 📡 API Reference

### 1. Health Check
`GET /api/health`

**Response:**
```json
{
  "status": "ok",
  "mode": "demo",
  "reviewerModel": "gemma-4-26b-a4b-it",
  "finalJudgeModel": "gemma-4-31b-it",
  "reviewerConcurrency": 4,
  "configuredApiKey": true
}
```

### 2. Review Solution
`POST /api/review`

**Content-Type**: `multipart/form-data`

* **Parameters**:
  * `question` *(string, required)*: Problem statement / prompt.
  * `image` *(file, required)*: Uploaded image file (`image/png`, `image/jpeg`, `image/webp`).

**Response Schema:**
```json
{
  "success": true,
  "data": {
    "final_judgment": {
      "verdict": "incorrect",
      "confidence": 0.95,
      "first_mistake": "The transition from q0 to q1 is written as 'B -> B, R'.",
      "evidence": "The q0 to q1 transition is written as 'B -> B, R'.",
      "socratic_hint": "Consider which direction the tape head should move after reading the blank at the end of the number.",
      "reasoning_summary": "Moving right into blanks prevents the machine from reaching the least significant bit.",
      "reviewer_agreement": {
        "solver": "incorrect",
        "skeptic": "incorrect",
        "visual_inspector": "incorrect",
        "verifier": "incorrect"
      },
      "disagreement_summary": "All reviewers agreed on the incorrect rightward transition."
    },
    "reviewers": {
      "solver": { "role": "solver", "verdict": "incorrect", "confidence": 0.95, ... },
      "skeptic": { "role": "skeptic", "verdict": "incorrect", "confidence": 0.90, ... },
      "visual_inspector": { "role": "visual_inspector", "verdict": "incorrect", "confidence": 0.95, ... },
      "verifier": { "role": "verifier", "verdict": "incorrect", "confidence": 0.95, ... }
    }
  }
}
```

---

## 🧪 Testing & Verification Scripts

The backend includes test scripts to benchmark and verify the pipeline:

```bash
cd backend

# Run the complete Many Tiny Judges multimodal pipeline benchmark
npm run test:review

# Run a single-model multimodal diagnostic
npm run test:single

# Run reviewer consistency diagnostic across multiple runs
node test-review-consistency.js
```

---

## 📋 Evaluation Example

* **Problem Statement**: *"Design a Turing Machine that increments a given binary number by 1. Demonstrate the operation for the following two inputs."*
* **Test Image**: `backend/test-data/tm-solution.png` (Handwritten Turing Machine state diagram).
* **Observed Mistake**: The transition leaving state `q0` upon reading the blank (`B`) was written as `B → B, R` (moving further right into blanks) instead of `B → B, L` (moving leftward to increment the binary digits).
* **ProofLens Finding**: Accurately flagged as `incorrect` with literal evidence citing the `q0 → q1` transition and produced a guided Socratic Hint.

---

## ⚠️ Limitations & Notes

* **API Capacity**: Google’s Gemma endpoints may occasionally experience temporary 500/503 surges under peak load; ProofLens incorporates retries and graceful degradation.
* **Handwriting Quality**: Multimodal interpretation accuracy is subject to lighting, contrast, and handwriting clarity.
* **Educational Prototype**: ProofLens is designed as an AI second-opinion assistant and formative feedback tool, not an authoritative academic examination proctor.

---

## 🔒 Security

* `GEMINI_API_KEY` is exclusively managed server-side in `backend/.env`.
* `.env` files are strictly excluded from version control via `.gitignore`.
* No API keys or credentials are leaked or stored in client-side code.
