# PULSE Fitness Intelligence & Kinesiology Coach
*GenAI for Business Course Project — Component 1: Generative AI Application Development*

---

## 📋 Executive Summary

**PULSE Fitness Intelligence** is an advanced, production-grade fitness intelligence platform and kinesiology coaching system built for the **GenAI for Business** course exam. It demonstrates practical AI application development, secure server-side LLM API integration, cloud database persistence, and cross-device synchronization (PC & Mobile).

- **Live Application URL**: [https://ais-dev-v6ycxt2ezv5xqkxpurllo5-652443039299.europe-west1.run.app](https://ais-dev-v6ycxt2ezv5xqkxpurllo5-652443039299.europe-west1.run.app)
- **Shared Preview URL**: [https://ais-pre-v6ycxt2ezv5xqkxpurllo5-652443039299.europe-west1.run.app](https://ais-pre-v6ycxt2ezv5xqkxpurllo5-652443039299.europe-west1.run.app)
- **Database**: Firebase Firestore (`ai-studio-lifeos-a4e79d23-a5a1-4924-89de-06b6f721f5fe`)

---

## 🎯 Component 1 Assessment Mapping

| Requirement | Implementation in PULSE |
| :--- | :--- |
| **Objective** (Working app using GenAI API) | Integrated **Google Gemini API** (`@google/genai`) on the server-side to power custom kinesiology coaching, real-time workout adaptation, and AI program generation. |
| **Platform** | Built in **Google AI Studio** using full-stack React, TypeScript, Express, and Tailwind CSS. |
| **Examples / Capabilities** | Features an intelligent **AI Coach Chat**, **Automated Workout Generator**, **Form Analysis Guidance**, and **Macro/Hormone Protocol Planner**. |
| **Deliverable & Documentation** | Live deployed cloud application accompanied by this comprehensive `README.md` walking through architecture, features, and programmatic AI usage. |
| **Skills Assessed** | • API Integration (Secure server-side proxying)<br>• Practical AI Application Development<br>• Programmatic LLM utilization (prompt engineering & structured generation) |

---

## 🚀 Key Features & Modules

### 1. AI Kinesiology Coach & Program Generator
- **Interactive Coaching Chat**: Ask questions about form, progressive overload, injury rehabilitation, or nutrition and receive expert, context-aware answers generated programmatically via Gemini.
- **AI Workout Program Generator**: Generates complete 4-week periodized hypertrophy or strength training programs tailored to user goals and fitness levels.

### 2. Weekly Overload Matrix Planner
- **Matrix Grid**: Days down and Weeks right structure for tracking volume progression across microcycles.
- **Independent Set Management**: Easily add or remove sets per exercise (`+Set` / `-Set`) to customize volume dynamically.
- **Deload Integration**: Automated deload week scheduling and volume multipliers.

### 3. Health Intelligence Hub & Integrations
- **Biometric Sync**: Tracks scale weight (Beurer), daily steps and activity (Google Health), and nutrition macro targets (FatSecret).
- **Recovery & Readiness Scoring**: Evaluates sleep, stress, and soreness to recommend daily training adjustments.

### 4. Real-Time Cloud Persistence (Firebase Firestore)
- **Seamless Cross-Device Sync**: Automatically syncs workout logs, matrix plans, and user settings between PC and mobile devices in real time.
- **Authentication**: Supports Google Sign-In and anonymous cloud session syncing.

---

## ⚙️ Technical Architecture & Stack

- **Frontend**: React 18, Vite, Tailwind CSS, Lucide React icons, Recharts for progression analytics.
- **Backend**: Node.js & Express.ts server handling API routing and secure LLM calls.
- **AI Integration**: `@google/genai` SDK securely invoked on the server-side (`/api/*`) using environment-managed API keys (`GEMINI_API_KEY`).
- **Database & Auth**: Firebase Firestore (`ai-studio-lifeos-a4e79d23-a5a1-4924-89de-06b6f721f5fe`) and Firebase Authentication.

---

## 💻 How to Run Locally

1. Install dependencies:
   ```bash
   npm install
   ```
2. Configure environment variables in `.env.example`:
   ```env
   GEMINI_API_KEY=your_api_key_here
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```
4. Build for production:
   ```bash
   npm run build
   ```
