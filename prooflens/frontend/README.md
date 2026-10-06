# ProofLens Frontend

A minimal, responsive React + Vite single-page frontend for the ProofLens Multimodal AI Reviewer.

---

## 🚀 Getting Started

### 1. Install Dependencies
```bash
cd prooflens/frontend
npm install
```

### 2. Run Development Server
```bash
npm run dev
```

The frontend will be available at `http://localhost:5173`.

---

## 🔌 Backend Connection

The frontend automatically communicates with the ProofLens backend at:
```
POST http://localhost:5000/api/review
```

Ensure the backend server is running:
```bash
cd prooflens/backend
npm start
```
