import React, { useState } from 'react';

const DEFAULT_QUESTION =
  'Design a Turing Machine that increments a given binary number by 1. Demonstrate the operation for the following two inputs.';

const BACKEND_URL = 'http://localhost:5000/api/review';

export default function App() {
  const [question, setQuestion] = useState(DEFAULT_QUESTION);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
      setError(null);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
      setError(null);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleAnalyze = async () => {
    if (!question.trim()) {
      setError('Please enter a question before analyzing.');
      return;
    }
    if (!imageFile) {
      setError('Please select or upload a student solution image.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('question', question.trim());
      formData.append('image', imageFile);

      const response = await fetch(BACKEND_URL, {
        method: 'POST',
        body: formData
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        const errorMsg =
          data.message ||
          (data.error === 'AllReviewersUnavailable'
            ? 'One or more Gemma reviewers were temporarily unavailable. Please try again.'
            : 'ProofLens could not complete the review. Please try again.');
        setError(errorMsg);
        if (data.data?.reviewers) {
          setResult({ reviewers: data.data.reviewers, final_judgment: null });
        }
      } else {
        setResult(data.data);
      }
    } catch (err) {
      setError('ProofLens could not complete the review. Please ensure the backend server is running and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setQuestion(DEFAULT_QUESTION);
    setImageFile(null);
    setImagePreview(null);
    setResult(null);
    setError(null);
  };

  const getVerdictBadgeClass = (verdict) => {
    switch (verdict?.toLowerCase()) {
      case 'correct':
        return 'badge-correct';
      case 'incorrect':
        return 'badge-incorrect';
      case 'uncertain':
        return 'badge-uncertain';
      default:
        return 'badge-unavailable';
    }
  };

  const reviewers = result?.reviewers || {};
  const finalJudgment = result?.final_judgment;

  return (
    <div className="app-container">
      {/* Top Banner Value Statement */}
      <div className="top-value-banner">
        <span>One solution. Four independent reviewers. One evidence-based judgment.</span>
      </div>

      {/* Header */}
      <header className="header">
        <div className="header-brand">
          <div className="logo-badge">🔍</div>
          <div>
            <div className="title-row">
              <h1 className="title">ProofLens</h1>
              <span className="model-badge">Powered by Gemma 4</span>
            </div>
            <p className="subtitle">Multimodal AI Second Opinion</p>
          </div>
        </div>
        <p className="tagline">Get a second look at your handwritten solutions.</p>
      </header>

      {/* Main Content */}
      <main className="main-content">
        {/* Input Card */}
        <div className="card input-card">
          <div className="input-card-header">
            <h2 className="card-heading">Submit Handwritten Solution</h2>
            <p className="card-subheading">Provide your problem statement and upload your handwritten diagram or derivation.</p>
          </div>

          {/* Section 1: Question */}
          <div className="form-group">
            <div className="step-label">
              <span className="step-circle">1</span>
              <label htmlFor="question-input">Enter Problem Question</label>
            </div>
            <textarea
              id="question-input"
              className="textarea"
              rows={3}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Enter the problem statement, prompt, or test cases here..."
              disabled={isLoading}
            />
          </div>

          {/* Section 2: Upload Solution */}
          <div className="form-group">
            <div className="step-label">
              <span className="step-circle">2</span>
              <label>Upload Handwritten Solution</label>
            </div>

            <div
              className={`upload-dropzone ${imageFile ? 'has-file' : ''}`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
            >
              {imagePreview ? (
                <div className="preview-wrapper">
                  <img src={imagePreview} alt="Solution preview" className="image-preview" />
                  <div className="preview-meta">
                    <div className="file-info">
                      <span className="file-name">{imageFile?.name}</span>
                      <span className="file-size">({(imageFile?.size / 1024).toFixed(1)} KB)</span>
                    </div>
                    <label htmlFor="file-replace" className="btn-replace">
                      Replace Image
                    </label>
                    <input
                      id="file-replace"
                      type="file"
                      accept="image/png, image/jpeg, image/webp"
                      onChange={handleImageChange}
                      style={{ display: 'none' }}
                      disabled={isLoading}
                    />
                  </div>
                </div>
              ) : (
                <label htmlFor="file-upload" className="upload-placeholder">
                  <div className="upload-icon-circle">📷</div>
                  <span className="upload-text">
                    <strong>Drop your solution image here</strong>
                  </span>
                  <span className="upload-hint">PNG, JPG or WEBP</span>
                  <input
                    id="file-upload"
                    type="file"
                    accept="image/png, image/jpeg, image/webp"
                    onChange={handleImageChange}
                    style={{ display: 'none' }}
                    disabled={isLoading}
                  />
                </label>
              )}
            </div>
          </div>

          {/* Section 3: Action Buttons */}
          <div className="action-row">
            <button
              className="btn-primary btn-analyze"
              onClick={handleAnalyze}
              disabled={isLoading || !question.trim() || !imageFile}
            >
              {isLoading ? (
                <span className="btn-loading-content">
                  <span className="spinner"></span> Analyzing with Gemma 4...
                </span>
              ) : (
                '🔍 Analyze Solution'
              )}
            </button>

            {result && (
              <button className="btn-secondary" onClick={handleReset} disabled={isLoading}>
                Start New Review
              </button>
            )}
          </div>

          {/* Error Banner */}
          {error && (
            <div className="error-banner">
              <span className="error-icon">⚠️</span>
              <div>
                <strong>Error:</strong> {error}
              </div>
            </div>
          )}
        </div>

        {/* Loading / In-Progress Analysis State */}
        {isLoading && (
          <div className="card loading-card">
            <div className="loading-spinner-wrapper">
              <div className="loading-spinner-ring"></div>
            </div>
            <h3 className="loading-title">ProofLens is analyzing your solution</h3>
            <p className="loading-sub">ProofLens is consulting four independent reviewers and a Final Judge.</p>

            <div className="loading-judges-grid">
              <div className="loading-judge-pill">
                <span className="status-dot"></span> Solver
              </div>
              <div className="loading-judge-pill">
                <span className="status-dot"></span> Skeptic
              </div>
              <div className="loading-judge-pill">
                <span className="status-dot"></span> Visual Inspector
              </div>
              <div className="loading-judge-pill">
                <span className="status-dot"></span> Verifier
              </div>
            </div>

            <p className="loading-latency-note">
              ⏳ This can take a little while because multiple Gemma reviewers are consulted.
            </p>
          </div>
        )}

        {/* Results View */}
        {result && (
          <div className="results-container">
            {/* Architecture Visual Diagram */}
            <div className="card architecture-card">
              <div className="arch-header-row">
                <h3 className="arch-title">Many Tiny Judges Review Pipeline</h3>
                <div className="demo-mode-badge-wrapper">
                  <span className="demo-mode-tag">FAST DEMO MODE</span>
                  <span className="demo-mode-sub">4 independent Gemma 4 reviewers + Final Judge</span>
                </div>
              </div>
              <div className="pipeline-flow">
                <div className="pipeline-box student-box">
                  <span className="pipe-badge">Input</span>
                  <strong>Your Solution (Image + Question)</strong>
                </div>
                <div className="pipeline-connector">
                  <div className="pipe-line"></div>
                  <span className="pipe-arrow">↓</span>
                </div>
                <div className="pipeline-reviewers">
                  <div className="pipe-reviewer">
                    <span className="pipe-role-icon">🧠</span>
                    <span className="pipe-role-name">Solver</span>
                  </div>
                  <div className="pipe-reviewer">
                    <span className="pipe-role-icon">🧐</span>
                    <span className="pipe-role-name">Skeptic</span>
                  </div>
                  <div className="pipe-reviewer">
                    <span className="pipe-role-icon">👁️</span>
                    <span className="pipe-role-name">Visual Inspector</span>
                  </div>
                  <div className="pipe-reviewer">
                    <span className="pipe-role-icon">🛡️</span>
                    <span className="pipe-role-name">Verifier</span>
                  </div>
                </div>
                <div className="pipeline-connector">
                  <div className="pipe-line"></div>
                  <span className="pipe-arrow">↓</span>
                </div>
                <div className="pipeline-box judge-box">
                  <span className="pipe-badge">Reconciliation</span>
                  <strong>Final Judge Assessment</strong>
                </div>
                <div className="pipeline-connector">
                  <div className="pipe-line"></div>
                  <span className="pipe-arrow">↓</span>
                </div>
                <div className="pipeline-box hint-box">
                  <span className="pipe-badge">Pedagogical</span>
                  <strong>💡 Socratic Guidance Hint</strong>
                </div>
              </div>
            </div>

            {/* Context Header: Original Question & Uploaded Image */}
            <div className="card context-summary-card">
              <div className="context-grid">
                <div className="context-question">
                  <span className="context-label">Evaluated Question:</span>
                  <p className="context-text">{question}</p>
                </div>
                {imagePreview && (
                  <div className="context-image-box">
                    <span className="context-label">Evaluated Solution Image:</span>
                    <img src={imagePreview} alt="Evaluated solution" className="context-thumb" />
                  </div>
                )}
              </div>
            </div>

            {/* Socratic Hint (Prominent Educational Card) */}
            {finalJudgment?.socratic_hint && (
              <div className="card socratic-hint-card">
                <div className="hint-top-bar">
                  <span className="hint-badge">Guided Learning</span>
                </div>
                <div className="hint-header">
                  <span className="hint-icon">💡</span>
                  <div>
                    <h2 className="hint-title">Socratic Hint</h2>
                    <p className="hint-subtitle">Think about this before looking for the answer.</p>
                  </div>
                </div>
                <div className="hint-body">
                  <p className="hint-prompt">{finalJudgment.socratic_hint}</p>
                </div>
              </div>
            )}

            {/* Final Judge Main Result */}
            {finalJudgment && (
              <div className="card final-judge-card">
                <div className="judge-card-header">
                  <div>
                    <div className="judge-title-row">
                      <span className="judge-icon">⚖️</span>
                      <h2 className="judge-title">Final Judge</h2>
                    </div>
                    <p className="judge-sub">Evidence-grounded synthesis across all independent reviewers</p>
                  </div>
                  <div className="verdict-group">
                    <span className={`verdict-pill-large ${getVerdictBadgeClass(finalJudgment.verdict)}`}>
                      {finalJudgment.verdict?.toUpperCase()}
                    </span>
                    <span className="confidence-tag">
                      Confidence: {Math.round((finalJudgment.confidence || 0) * 100)}%
                    </span>
                  </div>
                </div>

                <div className="judge-details-grid">
                  {finalJudgment.first_mistake && (
                    <div className="judge-detail-block mistake-block">
                      <span className="judge-detail-label">First Confirmed Mistake</span>
                      <p className="judge-mistake-text">{finalJudgment.first_mistake}</p>
                    </div>
                  )}

                  {finalJudgment.evidence && (
                    <div className="judge-detail-block evidence-block">
                      <span className="judge-detail-label">Literal Visual Evidence</span>
                      <p className="judge-evidence-text">{finalJudgment.evidence}</p>
                    </div>
                  )}

                  {finalJudgment.reasoning_summary && (
                    <div className="judge-detail-block reasoning-block">
                      <span className="judge-detail-label">Reasoning Summary</span>
                      <p className="judge-reasoning-text">{finalJudgment.reasoning_summary}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Reviewer Agreement Section */}
            {finalJudgment && (
              <div className="card agreement-card">
                <h3 className="section-title">Reviewer Agreement</h3>
                <div className="agreement-grid">
                  <div className="agreement-row">
                    <span className="agreement-name">🧠 Solver</span>
                    <span className={`badge badge-sm ${getVerdictBadgeClass(finalJudgment.reviewer_agreement?.solver)}`}>
                      {finalJudgment.reviewer_agreement?.solver || 'Unavailable'}
                    </span>
                  </div>
                  <div className="agreement-row">
                    <span className="agreement-name">🧐 Skeptic</span>
                    <span className={`badge badge-sm ${getVerdictBadgeClass(finalJudgment.reviewer_agreement?.skeptic)}`}>
                      {finalJudgment.reviewer_agreement?.skeptic || 'Unavailable'}
                    </span>
                  </div>
                  <div className="agreement-row">
                    <span className="agreement-name">👁️ Visual Inspector</span>
                    <span className={`badge badge-sm ${getVerdictBadgeClass(finalJudgment.reviewer_agreement?.visual_inspector)}`}>
                      {finalJudgment.reviewer_agreement?.visual_inspector || 'Unavailable'}
                    </span>
                  </div>
                  <div className="agreement-row">
                    <span className="agreement-name">🛡️ Verifier</span>
                    <span className={`badge badge-sm ${getVerdictBadgeClass(finalJudgment.reviewer_agreement?.verifier)}`}>
                      {finalJudgment.reviewer_agreement?.verifier || 'Unavailable'}
                    </span>
                  </div>
                </div>

                {finalJudgment.disagreement_summary && (
                  <div className="disagreement-container">
                    <span className="disagreement-heading">Disagreement Summary</span>
                    <p className="disagreement-text">{finalJudgment.disagreement_summary}</p>
                  </div>
                )}
              </div>
            )}

            {/* 4 Independent Reviewer Cards (2x2 Grid) */}
            <div className="reviewers-section">
              <div className="reviewers-section-header">
                <h3 className="section-title">Independent Reviewer Cards</h3>
                <span className="section-subtitle">2x2 Multi-Perspective Analysis</span>
              </div>

              <div className="reviewers-grid-2x2">
                {/* 1. Solver */}
                <div className="card reviewer-card">
                  <div className="rev-header">
                    <div className="rev-role">
                      <span className="rev-icon">🧠</span>
                      <span className="rev-title">Solver</span>
                    </div>
                    <span className={`badge badge-sm ${getVerdictBadgeClass(reviewers.solver?.verdict)}`}>
                      {reviewers.solver?.verdict || 'Unavailable'}
                    </span>
                  </div>

                  {reviewers.solver?.available !== false ? (
                    <div className="rev-content">
                      <div className="rev-stat-row">
                        <span className="rev-stat-label">Status:</span>
                        <span className="rev-stat-val text-success">Available</span>
                        <span className="rev-stat-label">Confidence:</span>
                        <span className="rev-stat-val">{Math.round((reviewers.solver?.confidence || 0) * 100)}%</span>
                      </div>
                      <div className="rev-item">
                        <span className="rev-item-label">First Mistake:</span>
                        <p className="rev-item-text">{reviewers.solver?.first_mistake || 'None detected'}</p>
                      </div>
                      <div className="rev-item">
                        <span className="rev-item-label">Evidence:</span>
                        <p className="rev-item-text code-font">{reviewers.solver?.evidence || 'N/A'}</p>
                      </div>
                      {reviewers.solver?.reasoning && (
                        <details className="rev-details">
                          <summary className="rev-summary-toggle">View reasoning</summary>
                          <p className="rev-reasoning-body">{reviewers.solver.reasoning}</p>
                        </details>
                      )}
                    </div>
                  ) : (
                    <div className="rev-unavailable-box">
                      <strong>Reviewer unavailable</strong>
                      <span>Temporary model/API failure</span>
                    </div>
                  )}
                </div>

                {/* 2. Skeptic */}
                <div className="card reviewer-card">
                  <div className="rev-header">
                    <div className="rev-role">
                      <span className="rev-icon">🧐</span>
                      <span className="rev-title">Skeptic</span>
                    </div>
                    <span className={`badge badge-sm ${getVerdictBadgeClass(reviewers.skeptic?.verdict)}`}>
                      {reviewers.skeptic?.verdict || 'Unavailable'}
                    </span>
                  </div>

                  {reviewers.skeptic?.available !== false ? (
                    <div className="rev-content">
                      <div className="rev-stat-row">
                        <span className="rev-stat-label">Status:</span>
                        <span className="rev-stat-val text-success">Available</span>
                        <span className="rev-stat-label">Confidence:</span>
                        <span className="rev-stat-val">{Math.round((reviewers.skeptic?.confidence || 0) * 100)}%</span>
                      </div>
                      <div className="rev-item">
                        <span className="rev-item-label">First Mistake:</span>
                        <p className="rev-item-text">{reviewers.skeptic?.first_mistake || 'None detected'}</p>
                      </div>
                      <div className="rev-item">
                        <span className="rev-item-label">Evidence:</span>
                        <p className="rev-item-text code-font">{reviewers.skeptic?.evidence || 'N/A'}</p>
                      </div>
                      {reviewers.skeptic?.reasoning && (
                        <details className="rev-details">
                          <summary className="rev-summary-toggle">View reasoning</summary>
                          <p className="rev-reasoning-body">{reviewers.skeptic.reasoning}</p>
                        </details>
                      )}
                    </div>
                  ) : (
                    <div className="rev-unavailable-box">
                      <strong>Reviewer unavailable</strong>
                      <span>Temporary model/API failure</span>
                    </div>
                  )}
                </div>

                {/* 3. Visual Inspector */}
                <div className="card reviewer-card">
                  <div className="rev-header">
                    <div className="rev-role">
                      <span className="rev-icon">👁️</span>
                      <span className="rev-title">Visual Inspector</span>
                    </div>
                    <span className={`badge badge-sm ${getVerdictBadgeClass(reviewers.visual_inspector?.verdict)}`}>
                      {reviewers.visual_inspector?.verdict || 'Unavailable'}
                    </span>
                  </div>

                  {reviewers.visual_inspector?.available !== false ? (
                    <div className="rev-content">
                      <div className="rev-stat-row">
                        <span className="rev-stat-label">Status:</span>
                        <span className="rev-stat-val text-success">Available</span>
                        <span className="rev-stat-label">Confidence:</span>
                        <span className="rev-stat-val">{Math.round((reviewers.visual_inspector?.confidence || 0) * 100)}%</span>
                      </div>
                      <div className="rev-item">
                        <span className="rev-item-label">First Mistake:</span>
                        <p className="rev-item-text">{reviewers.visual_inspector?.first_mistake || 'None detected'}</p>
                      </div>
                      <div className="rev-item">
                        <span className="rev-item-label">Evidence:</span>
                        <p className="rev-item-text code-font">{reviewers.visual_inspector?.evidence || 'N/A'}</p>
                      </div>
                      {reviewers.visual_inspector?.reasoning && (
                        <details className="rev-details">
                          <summary className="rev-summary-toggle">View reasoning</summary>
                          <p className="rev-reasoning-body">{reviewers.visual_inspector.reasoning}</p>
                        </details>
                      )}
                    </div>
                  ) : (
                    <div className="rev-unavailable-box">
                      <strong>Reviewer unavailable</strong>
                      <span>Temporary model/API failure</span>
                    </div>
                  )}
                </div>

                {/* 4. Verifier */}
                <div className="card reviewer-card">
                  <div className="rev-header">
                    <div className="rev-role">
                      <span className="rev-icon">🛡️</span>
                      <span className="rev-title">Verifier</span>
                    </div>
                    <span className={`badge badge-sm ${getVerdictBadgeClass(reviewers.verifier?.verdict)}`}>
                      {reviewers.verifier?.verdict || 'Unavailable'}
                    </span>
                  </div>

                  {reviewers.verifier?.available !== false ? (
                    <div className="rev-content">
                      <div className="rev-stat-row">
                        <span className="rev-stat-label">Status:</span>
                        <span className="rev-stat-val text-success">Available</span>
                        <span className="rev-stat-label">Confidence:</span>
                        <span className="rev-stat-val">{Math.round((reviewers.verifier?.confidence || 0) * 100)}%</span>
                      </div>
                      <div className="rev-item">
                        <span className="rev-item-label">First Mistake:</span>
                        <p className="rev-item-text">{reviewers.verifier?.first_mistake || 'None detected'}</p>
                      </div>
                      <div className="rev-item">
                        <span className="rev-item-label">Evidence:</span>
                        <p className="rev-item-text code-font">{reviewers.verifier?.evidence || 'N/A'}</p>
                      </div>
                      {reviewers.verifier?.reasoning && (
                        <details className="rev-details">
                          <summary className="rev-summary-toggle">View reasoning</summary>
                          <p className="rev-reasoning-body">{reviewers.verifier.reasoning}</p>
                        </details>
                      )}
                    </div>
                  ) : (
                    <div className="rev-unavailable-box">
                      <strong>Reviewer unavailable</strong>
                      <span>Temporary model/API failure</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Bottom Action */}
            <div className="bottom-reset-row">
              <button className="btn-secondary btn-large-reset" onClick={handleReset}>
                Start New Review
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="footer">
        <p>ProofLens • Multimodal AI Student Solution Reviewer</p>
      </footer>
    </div>
  );
}
