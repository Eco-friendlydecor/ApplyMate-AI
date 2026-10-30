import React, { useEffect, useMemo, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import mammoth from "mammoth/mammoth.browser";
import "./App.css";

// PDF.js worker (the matching CDN version avoids Vite worker-path resolution issues).
pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";

const STORAGE = {
  profile: "applymate-profile-v1",
  analyses: "applymate-analyses-v1",
  jobs: "applymate-jobs-v1",
  settings: "applymate-settings-v1",
};

const DEFAULT_PROFILE = {
  name: "Chetan Sahu",
  email: "",
  phone: "",
  title: "Full Stack Developer",
  skills: "JavaScript, React.js, Node.js, Python, Java, SQL, HTML, CSS",
  portfolio: "",
  linkedin: "",
  github: "",
};

const COMMON_SKILLS = [
  "JavaScript", "TypeScript", "React", "React.js", "Node.js", "Express",
  "Python", "Java", "SQL", "MySQL", "PostgreSQL", "MongoDB", "HTML",
  "CSS", "REST API", "Git", "GitHub", "Docker", "AWS", "Google Cloud",
  "Data Structures", "Algorithms", "OOP", "Spring Boot", "Next.js",
  "Tailwind CSS", "Machine Learning", "Data Analysis", "FastAPI", "Django",
];

const readStorage = (key, fallback) => {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
};

const saveStorage = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error("Could not save data:", error);
  }
};

const cleanText = (value = "") =>
  value.replace(/\u0000/g, " ").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

function extractSections(text) {
  const lower = text.toLowerCase();
  const checks = [
    ["Contact information", /(@|phone|mobile|linkedin|github)/i],
    ["Professional summary", /(summary|professional profile|objective)/i],
    ["Skills", /(technical skills|skills|technologies)/i],
    ["Work experience", /(experience|employment|internship|work history)/i],
    ["Projects", /(projects|personal projects)/i],
    ["Education", /(education|academic|bachelor|degree|university|college)/i],
    ["Certifications", /(certifications|certificates|courses)/i],
  ];
  return checks.map(([name, pattern]) => ({
    name,
    found: pattern.test(lower),
  }));
}

function analyzeResume(text) {
  const content = cleanText(text);
  const lower = content.toLowerCase();
  const sections = extractSections(content);
  const matchedSkills = COMMON_SKILLS.filter((skill) =>
    lower.includes(skill.toLowerCase())
  );
  const wordCount = content.split(/\s+/).filter(Boolean).length;
  const sectionScore = Math.round(
    (sections.filter((item) => item.found).length / sections.length) * 35
  );
  const skillScore = Math.min(25, Math.round((matchedSkills.length / 10) * 25));
  const lengthScore = wordCount >= 250 && wordCount <= 1100 ? 15 :
    wordCount >= 150 ? 10 : wordCount > 1100 ? 8 : 4;
  const contactScore = /@/.test(content) && /\d{8,}/.test(content) ? 10 : /@/.test(content) ? 7 : 2;
  const actionWords = ["developed", "built", "created", "improved", "implemented", "designed", "managed", "automated", "achieved"];
  const actionCount = actionWords.filter((word) => lower.includes(word)).length;
  const impactScore = Math.min(15, actionCount * 2);
  const score = Math.min(100, sectionScore + skillScore + lengthScore + contactScore + impactScore);

  const suggestions = [];
  if (!sections.find((s) => s.name === "Professional summary").found) suggestions.push("Add a concise professional summary tailored to the role.");
  if (!sections.find((s) => s.name === "Skills").found) suggestions.push("Add a clearly labeled Technical Skills section.");
  if (!sections.find((s) => s.name === "Projects").found) suggestions.push("Include 2–3 relevant projects with technologies and measurable outcomes.");
  if (!sections.find((s) => s.name === "Work experience").found) suggestions.push("Describe internships, work experience, or practical contributions.");
  if (!sections.find((s) => s.name === "Education").found) suggestions.push("Make your education details easy for ATS software to identify.");
  if (matchedSkills.length < 6) suggestions.push("Add relevant technical skills that genuinely match the jobs you are applying for.");
  if (actionCount < 4) suggestions.push("Start bullet points with action verbs and include measurable results where possible.");
  if (wordCount < 250) suggestions.push("Add more detail about projects, responsibilities, and achievements.");
  if (suggestions.length === 0) suggestions.push("Good job! Your resume includes the major sections. Tailor keywords for each job description.");

  return {
    score,
    keywordCoverage: Math.min(100, Math.round((matchedSkills.length / 10) * 100)),
    matchedSkills,
    sections,
    suggestions,
    wordCount,
    analyzedAt: new Date().toISOString(),
  };
}

async function readResumeFile(file) {
  const extension = file.name.split(".").pop().toLowerCase();
  if (extension === "txt") return cleanText(await file.text());

  if (extension === "pdf") {
    const data = new Uint8Array(await file.arrayBuffer());
    const pdf = await pdfjsLib.getDocument({ data }).promise;
    const pages = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(content.items.map((item) => item.str).join(" "));
    }
    const text = cleanText(pages.join("\n"));
    if (!text) {
      throw new Error("No selectable text was found. This may be a scanned PDF; please use a text-based PDF or paste the resume text manually.");
    }
    return text;
  }

  if (extension === "docx") {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return cleanText(result.value);
  }

  throw new Error("Please upload a PDF, DOCX, or TXT file.");
}

function scoreAgainstJob(resumeText, jobText) {
  const words = [...new Set(
    jobText.toLowerCase().match(/[a-z][a-z0-9+#.]{2,}/g) || []
  )].filter((word) => !["the", "and", "for", "with", "you", "are", "will", "our", "this", "that", "from", "have", "your", "years", "work", "role"].includes(word));
  const resume = resumeText.toLowerCase();
  const matched = words.filter((word) => resume.includes(word));
  const missing = words.filter((word) => !resume.includes(word)).slice(0, 20);
  const score = words.length ? Math.round((matched.length / words.length) * 100) : 0;
  return { score, matched, missing, total: words.length };
}

function App() {
  const [activePage, setActivePage] = useState("Dashboard");
  const [profile, setProfile] = useState(() => readStorage(STORAGE.profile, DEFAULT_PROFILE));
  const [analyses, setAnalyses] = useState(() => readStorage(STORAGE.analyses, []));
  const [jobs, setJobs] = useState(() => readStorage(STORAGE.jobs, []));
  const [settings, setSettings] = useState(() => readStorage(STORAGE.settings, { compact: false }));
  const [resumeFile, setResumeFile] = useState(null);
  const [resumeText, setResumeText] = useState("");
  const [analysis, setAnalysis] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [atsResult, setAtsResult] = useState(null);
  const [jobForm, setJobForm] = useState({ company: "", role: "", status: "Applied", link: "", date: new Date().toISOString().slice(0, 10) });
  const [editingJobId, setEditingJobId] = useState(null);
  const fileInput = useRef(null);

  useEffect(() => saveStorage(STORAGE.profile, profile), [profile]);
  useEffect(() => saveStorage(STORAGE.analyses, analyses), [analyses]);
  useEffect(() => saveStorage(STORAGE.jobs, jobs), [jobs]);
  useEffect(() => saveStorage(STORAGE.settings, settings), [settings]);

  const averageScore = useMemo(() => analyses.length
    ? Math.round(analyses.reduce((sum, item) => sum + item.score, 0) / analyses.length)
    : 0, [analyses]);

  const showNotice = (message) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 4500);
  };

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const allowed = ["pdf", "docx", "txt"];
    const extension = file.name.split(".").pop().toLowerCase();
    if (!allowed.includes(extension)) {
      showNotice("Please select a PDF, DOCX, or TXT file.");
      event.target.value = "";
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      showNotice("File is too large. Please upload a file smaller than 10 MB.");
      event.target.value = "";
      return;
    }
    setResumeFile(file);
    setAnalysis(null);
    setAtsResult(null);
    setBusy(true);
    try {
      const extracted = await readResumeFile(file);
      setResumeText(extracted);
      showNotice("Resume text extracted successfully. You can now analyze it.");
    } catch (error) {
      setResumeText("");
      showNotice(error.message || "Could not read this file.");
    } finally {
      setBusy(false);
    }
  };

  const runAnalysis = () => {
    if (!resumeText.trim()) {
      showNotice("Upload a readable resume first, or paste your resume details in the text box.");
      return;
    }
    const result = analyzeResume(resumeText);
    setAnalysis(result);
    setAnalyses((current) => [{
      id: Date.now(),
      fileName: resumeFile?.name || "Pasted resume text",
      score: result.score,
      analyzedAt: result.analyzedAt,
      keywordCoverage: result.keywordCoverage,
    }, ...current].slice(0, 30));
    showNotice("Resume analysis completed.");
  };

  const runAtsCheck = () => {
    if (!resumeText.trim()) {
      showNotice("First upload a resume in Resume Analyzer.");
      setActivePage("Resume Analyzer");
      return;
    }
    if (!jobDescription.trim()) {
      showNotice("Paste the job description to compare it with your resume.");
      return;
    }
    setAtsResult(scoreAgainstJob(resumeText, jobDescription));
  };

  const resetJobForm = () => {
    setJobForm({ company: "", role: "", status: "Applied", link: "", date: new Date().toISOString().slice(0, 10) });
    setEditingJobId(null);
  };

  const saveJob = (event) => {
    event.preventDefault();
    if (!jobForm.company.trim() || !jobForm.role.trim()) {
      showNotice("Please enter both company and job role.");
      return;
    }
    if (editingJobId) {
      setJobs((current) => current.map((job) => job.id === editingJobId ? { ...jobForm, id: editingJobId } : job));
      showNotice("Job updated.");
    } else {
      setJobs((current) => [{ ...jobForm, id: Date.now() }, ...current]);
      showNotice("Job added to your tracker.");
    }
    resetJobForm();
  };

  const editJob = (job) => {
    setJobForm({ company: job.company, role: job.role, status: job.status, link: job.link || "", date: job.date || "" });
    setEditingJobId(job.id);
    setActivePage("Job Tracker");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const deleteJob = (id) => {
    if (window.confirm("Delete this job application?")) {
      setJobs((current) => current.filter((job) => job.id !== id));
    }
  };

  const clearAllData = () => {
    if (!window.confirm("This will clear your saved profile, analyses, and job applications from this browser. Continue?")) return;
    setProfile(DEFAULT_PROFILE);
    setAnalyses([]);
    setJobs([]);
    setResumeFile(null);
    setResumeText("");
    setAnalysis(null);
    setAtsResult(null);
    Object.values(STORAGE).forEach((key) => localStorage.removeItem(key));
    showNotice("Local ApplyMate data cleared.");
  };

  const navItems = [
    ["Dashboard", "🏠"],
    ["Resume Analyzer", "📄"],
    ["ATS Checker", "🎯"],
    ["Job Tracker", "💼"],
    ["Settings", "⚙️"],
  ];

  return (
    <div className={`app-shell ${settings.compact ? "compact" : ""}`}>
      <aside className="sidebar">
        <button className="brand" onClick={() => setActivePage("Dashboard")}>Apply<span>Mate</span> AI</button>
        <div className="menu-label">MENU</div>
        <nav className="nav-list">
          {navItems.map(([label, icon]) => (
            <button key={label} className={`nav-link ${activePage === label ? "active" : ""}`} onClick={() => setActivePage(label)}>
              <span>{icon}</span>{label}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="avatar">{(profile.name || "C").trim().charAt(0).toUpperCase()}</div>
          <div><strong>{profile.name || "Your Name"}</strong><small>{profile.title || "Career profile"}</small></div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb">Dashboard <span>/</span> {activePage}</div>
          <button className="outline-button" onClick={() => setActivePage("Settings")}>My Profile</button>
        </header>

        {notice && <div className="toast" role="status">{notice}</div>}

        {activePage === "Dashboard" && (
          <section className="page">
            <div className="welcome-block">
              <p className="eyebrow">YOUR AI CAREER ASSISTANT</p>
              <h1>Welcome back, <span>{profile.name || "there"}!</span> 👋</h1>
              <p>Let's make your next career move smarter.</p>
            </div>
            <div className="stats-grid">
              <StatCard icon="📄" label="Resumes Analyzed" value={analyses.length} />
              <StatCard icon="🎯" label="Average Resume Score" value={`${averageScore}%`} />
              <StatCard icon="💼" label="Jobs Tracked" value={jobs.length} />
              <StatCard icon="📬" label="Interviews / Offers" value={jobs.filter((job) => ["Interview", "Offer"].includes(job.status)).length} />
            </div>
            <div className="panel">
              <div className="section-heading"><div><h2>Recent Resume Analyses</h2><p>Your latest resume score history</p></div><button className="primary-button" onClick={() => setActivePage("Resume Analyzer")}>Analyze Resume</button></div>
              {analyses.length === 0 ? <EmptyState text="No resume analyzed yet. Upload your resume to get started." /> :
                <div className="table-wrap"><table><thead><tr><th>File</th><th>Score</th><th>Keyword coverage</th><th>Date</th></tr></thead><tbody>
                  {analyses.slice(0, 5).map((item) => <tr key={item.id}><td>{item.fileName}</td><td><ScorePill score={item.score} /></td><td>{item.keywordCoverage}%</td><td>{new Date(item.analyzedAt).toLocaleDateString()}</td></tr>)}
                </tbody></table></div>}
            </div>
            <div className="panel">
              <div className="section-heading"><div><h2>Application Snapshot</h2><p>Track your job search progress</p></div><button className="text-button" onClick={() => setActivePage("Job Tracker")}>Open tracker →</button></div>
              <div className="status-summary">
                {["Applied", "Assessment", "Interview", "Offer", "Rejected"].map((status) => <div key={status}><span>{status}</span><strong>{jobs.filter((job) => job.status === status).length}</strong></div>)}
              </div>
            </div>
          </section>
        )}

        {activePage === "Resume Analyzer" && (
          <section className="page">
            <PageTitle icon="📄" title="Resume Analyzer" subtitle="Upload your resume and analyze your skills." />
            <div className="upload-panel">
              <div className="upload-icon">☁️</div>
              <h2>Upload Your Resume</h2>
              <p>PDF, DOCX or TXT files · Maximum 10 MB</p>
              <input ref={fileInput} className="file-input" type="file" accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" onChange={handleFile} />
              <button className="primary-button choose-button" onClick={() => fileInput.current?.click()} disabled={busy}>{busy ? "Reading file…" : "Choose File"}</button>
              {resumeFile && <div className="selected-file">✅ Selected: <strong>{resumeFile.name}</strong></div>}
            </div>
            <div className="panel editor-panel">
              <div className="section-heading"><div><h2>Resume Text / Details</h2><p>Extracted text appears here. You can also paste or edit it manually.</p></div></div>
              <textarea className="resume-textarea" value={resumeText} onChange={(event) => setResumeText(event.target.value)} placeholder="Upload your resume or paste your resume details here…" />
              <div className="editor-footer"><span>{resumeText.trim() ? resumeText.trim().split(/\s+/).length : 0} words</span><button className="primary-button" onClick={runAnalysis}>Analyze My Resume</button></div>
            </div>
            {analysis && <div className="panel results-panel">
              <div className="result-top"><div><p className="eyebrow">RESUME ANALYSIS RESULT</p><h2>Your Resume Score</h2></div><div className="score-circle"><strong>{analysis.score}</strong><span>/100</span></div></div>
              <div className="progress-track"><div style={{ width: `${analysis.score}%` }} /></div>
              <div className="result-metrics"><div><span>Keyword coverage</span><strong>{analysis.keywordCoverage}%</strong></div><div><span>Word count</span><strong>{analysis.wordCount}</strong></div><div><span>Skills detected</span><strong>{analysis.matchedSkills.length}</strong></div></div>
              <h3>Section checklist</h3>
              <div className="check-grid">{analysis.sections.map((item) => <div key={item.name} className={item.found ? "check-item found" : "check-item missing"}><span>{item.found ? "✓" : "＋"}</span>{item.name}</div>)}</div>
              <h3>Detected skills</h3>
              <div className="tag-list">{analysis.matchedSkills.length ? analysis.matchedSkills.map((skill) => <span className="tag" key={skill}>{skill}</span>) : <p className="muted">No common technical skills detected. You can add relevant skills in your resume text.</p>}</div>
              <h3>Suggestions for Improvement</h3>
              <ul className="suggestion-list">{analysis.suggestions.map((suggestion) => <li key={suggestion}>💡 {suggestion}</li>)}</ul>
            </div>}
          </section>
        )}

        {activePage === "ATS Checker" && (
          <section className="page">
            <PageTitle icon="🎯" title="ATS Compatibility Checker" subtitle="Compare your resume with a job description." />
            <div className="panel">
              <div className="section-heading"><div><h2>Job Description</h2><p>Paste the full job description to find matching and missing keywords.</p></div></div>
              <textarea className="resume-textarea job-description" value={jobDescription} onChange={(event) => setJobDescription(event.target.value)} placeholder="Paste the job description here…" />
              <div className="editor-footer"><span>{jobDescription.trim() ? jobDescription.trim().split(/\s+/).length : 0} words</span><button className="primary-button" onClick={runAtsCheck}>Check ATS Match</button></div>
            </div>
            {!resumeText.trim() && <div className="helper-banner">Upload your resume in <button className="inline-link" onClick={() => setActivePage("Resume Analyzer")}>Resume Analyzer</button> first. Your resume text will be used for this comparison.</div>}
            {atsResult && <div className="panel results-panel">
              <div className="result-top"><div><p className="eyebrow">JOB MATCH REPORT</p><h2>Keyword Match Score</h2></div><div className="score-circle"><strong>{atsResult.score}</strong><span>%</span></div></div>
              <div className="progress-track"><div style={{ width: `${atsResult.score}%` }} /></div>
              <p className="muted">{atsResult.matched.length} of {atsResult.total} identified job-description keywords found in your resume text.</p>
              <h3>Matching keywords</h3><div className="tag-list">{atsResult.matched.length ? atsResult.matched.map((word) => <span className="tag success-tag" key={word}>{word}</span>) : <p className="muted">No matching keywords found yet.</p>}</div>
              <h3>Keywords to consider adding (only if accurate)</h3><div className="tag-list">{atsResult.missing.map((word) => <span className="tag missing-tag" key={word}>{word}</span>)}</div>
            </div>}
          </section>
        )}

        {activePage === "Job Tracker" && (
          <section className="page">
            <PageTitle icon="💼" title="Job Application Tracker" subtitle="Keep your applications, interviews, and offers organized." />
            <div className="panel">
              <div className="section-heading"><div><h2>{editingJobId ? "Edit Application" : "Add New Application"}</h2><p>Save each opportunity and update its status as you progress.</p></div></div>
              <form className="job-form" onSubmit={saveJob}>
                <label>Company name<input value={jobForm.company} onChange={(e) => setJobForm({ ...jobForm, company: e.target.value })} placeholder="e.g. Example Technologies" /></label>
                <label>Job role<input value={jobForm.role} onChange={(e) => setJobForm({ ...jobForm, role: e.target.value })} placeholder="e.g. Software Engineer" /></label>
                <label>Status<select value={jobForm.status} onChange={(e) => setJobForm({ ...jobForm, status: e.target.value })}>{["Applied", "Assessment", "Interview", "Offer", "Rejected"].map((s) => <option key={s}>{s}</option>)}</select></label>
                <label>Applied date<input type="date" value={jobForm.date} onChange={(e) => setJobForm({ ...jobForm, date: e.target.value })} /></label>
                <label className="full-field">Job link (optional)<input type="url" value={jobForm.link} onChange={(e) => setJobForm({ ...jobForm, link: e.target.value })} placeholder="https://…" /></label>
                <div className="form-actions"><button className="primary-button" type="submit">{editingJobId ? "Update Application" : "Add Application"}</button>{editingJobId && <button className="outline-button" type="button" onClick={resetJobForm}>Cancel</button>}</div>
              </form>
            </div>
            <div className="panel">
              <div className="section-heading"><div><h2>Your Applications</h2><p>{jobs.length} application{jobs.length === 1 ? "" : "s"} saved in this browser</p></div></div>
              {jobs.length === 0 ? <EmptyState text="No applications yet. Add your first job above." /> :
                <div className="table-wrap"><table><thead><tr><th>Company / Role</th><th>Status</th><th>Applied date</th><th>Link</th><th>Actions</th></tr></thead><tbody>
                  {jobs.map((job) => <tr key={job.id}><td><strong>{job.company}</strong><small className="table-subtitle">{job.role}</small></td><td><span className={`status-pill status-${job.status.toLowerCase()}`}>{job.status}</span></td><td>{job.date || "—"}</td><td>{job.link ? <a href={job.link} target="_blank" rel="noreferrer">Open ↗</a> : "—"}</td><td><div className="row-actions"><button onClick={() => editJob(job)}>Edit</button><button className="danger-text" onClick={() => deleteJob(job.id)}>Delete</button></div></td></tr>)}
                </tbody></table></div>}
            </div>
          </section>
        )}

        {activePage === "Settings" && (
          <section className="page">
            <PageTitle icon="⚙️" title="Profile & Settings" subtitle="Manage your career profile and application preferences." />
            <div className="panel">
              <div className="section-heading"><div><h2>Personal Profile</h2><p>These details are saved locally in this browser.</p></div></div>
              <form className="job-form profile-form" onSubmit={(e) => { e.preventDefault(); showNotice("Profile saved successfully."); }}>
                <label>Full name<input value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} /></label>
                <label>Professional title<input value={profile.title} onChange={(e) => setProfile({ ...profile, title: e.target.value })} /></label>
                <label>Email<input type="email" value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} /></label>
                <label>Phone<input value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} /></label>
                <label>LinkedIn URL<input value={profile.linkedin} onChange={(e) => setProfile({ ...profile, linkedin: e.target.value })} /></label>
                <label>GitHub URL<input value={profile.github} onChange={(e) => setProfile({ ...profile, github: e.target.value })} /></label>
                <label className="full-field">Portfolio URL<input value={profile.portfolio} onChange={(e) => setProfile({ ...profile, portfolio: e.target.value })} /></label>
                <label className="full-field">Key skills<input value={profile.skills} onChange={(e) => setProfile({ ...profile, skills: e.target.value })} /></label>
                <div className="form-actions"><button className="primary-button" type="submit">Save Profile</button></div>
              </form>
            </div>
            <div className="panel settings-panel">
              <h2>Display Preferences</h2>
              <label className="toggle-row"><span><strong>Compact layout</strong><small>Reduce spacing between cards and sections.</small></span><input type="checkbox" checked={settings.compact} onChange={(e) => setSettings({ ...settings, compact: e.target.checked })} /></label>
            </div>
            <div className="panel danger-zone"><h2>Data management</h2><p>Your profile, analysis history, and job tracker are stored in this browser's local storage. They are not uploaded to a server.</p><button className="danger-button" onClick={clearAllData}>Clear all local data</button></div>
          </section>
        )}

        <footer className="footer">© {new Date().getFullYear()} ApplyMate AI <span>·</span> Built with 💗</footer>
      </main>
    </div>
  );
}

function StatCard({ icon, label, value }) {
  return <div className="stat-card"><span className="stat-icon">{icon}</span><p>{label}</p><strong>{value}</strong></div>;
}

function PageTitle({ icon, title, subtitle }) {
  return <div className="page-title"><span>{icon}</span><div><h1>{title}</h1><p>{subtitle}</p></div></div>;
}

function EmptyState({ text }) {
  return <div className="empty-state"><span>📂</span><p>{text}</p></div>;
}

function ScorePill({ score }) {
  return <span className={`score-pill ${score >= 75 ? "high" : score >= 50 ? "medium" : "low"}`}>{score}/100</span>;
}

export default App;
