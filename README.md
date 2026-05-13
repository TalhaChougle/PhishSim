🛡️ PhishSim: Security Awareness & Reporting Tool

PhishSim is a full-stack cybersecurity training platform designed to simulate phishing campaigns and provide deep-dive security analytics. It features an automated reporting engine that utilizes Google Gemini AI for executive summaries, with a robust local heuristic fallback for offline analysis.

<img width="1917" height="976" alt="image" src="https://github.com/user-attachments/assets/ff25b19d-96a7-4716-8953-0a7122394f38" />


🚀**[Live Demo](https://phishsim-csi.pages.dev/)**(Note: The backend is hosted on a free tier; please allow 30–50 seconds for the initial server wake-up if the report generation feels slow.)

🏗️ Architecture & Features
The project is built with a decoupled architecture to ensure scalability and professional-grade performance.

Frontend: React-based terminal-style UI with glassmorphic design.

Backend: Express.js server handling data processing and AI integration.

AI Reporting: Integrated with Gemini 2.0 Flash to generate professional security posture reports based on campaign metadata.

Graceful Degradation: A custom-built Local Heuristics Engine ensures reporting remains 100% operational even if the AI API is unreachable or the API key is missing.

Security: Environment variable management to protect sensitive API credentials and secure CORS configuration.

🛠️ Tech Stack
Frontend
Framework: React (Vite)

Styling: CSS3 (Custom Glassmorphism)

Deployment: Cloudflare Pages

Backend
Runtime: Node.js

Framework: Express.js

AI Model: Google Gemini 2.0 Flash

Deployment: Render

🚦 Getting Started
Prerequisites
Node.js (v18+)

npm or yarn

A Google AI Studio API Key

Installation
Clone the repository:

Bash
git clone https://github.com/TalhaChougle/PhishSim.git
cd PhishSim
Setup Backend:

Bash
cd server
npm install
# Create a .env file and add your GEMINI_API_KEY
node index.js
Setup Frontend:

Bash
cd client
npm install
npm run dev
🔒 Security Best Practices
This project implements professional security standards for deployment:

Cross-Origin Resource Sharing (CORS): Restricted to specific allowed origins to prevent unauthorized API access.

Credential Protection: .env files are excluded from version control via .gitignore.

API Safety: Server-side masking and processing of AI prompts to prevent credential leakage.

👤 Author
Talha Chougle
