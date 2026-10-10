<div align="center">

# 🎙️ KYRO PANEL • Autonomous AI Voice Interview Board
### *Three Synchronized AI Interviewers in a Single Real-Time WebRTC Bridge with Dynamic Floor Bidding*

<br/>

[![Status](https://img.shields.io/badge/System_Status-Online-10B981?style=for-the-badge&logo=statuspage&logoColor=white)](https://kyro-panel.onrender.com)
[![Agora RTC](https://img.shields.io/badge/Audio_Bridge-Agora_RTC_4.x-099DFD?style=for-the-badge&logo=soundcharts&logoColor=white)](https://kyro-panel.onrender.com)
[![Voice AI](https://img.shields.io/badge/ASR-Deepgram_Nova--3-13EF93?style=for-the-badge&logo=fastapi&logoColor=black)](https://kyro-panel.onrender.com)
[![React 19](https://img.shields.io/badge/Frontend-React_19_Concurrent-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://kyro-panel.onrender.com)
[![License](https://img.shields.io/badge/License-MIT-8B5CF6?style=for-the-badge)](LICENSE)

<br/>

**🌐 Live Production Deployment:** [https://kyro-panel.onrender.com](https://kyro-panel.onrender.com)

<br/>

<!-- HERO DEMO ANIMATION -->
<div align="center">
  <img src="docs/demo.gif" alt="Kyro Panel Autonomous Multi-Agent Voice Board" width="100%" style="border-radius: 14px; box-shadow: 0 20px 50px rgba(0, 0, 0, 0.7); border: 1px solid rgba(9, 157, 253, 0.3);" />
</div>

<br/>

<p align="center">
  A traditional AI interviewer asks a question, waits passively, and asks another.<br/>
  <b>Kyro Panel puts three distinct personas in the room</b>: a Technical Architect, a Product Manager, and an Executive Hiring Lead.<br/>
  After every answer, all three compute an intent score in parallel — the highest bidder takes the floor.<br/>
  They share a centralized real-time memory graph, preventing question duplication while rigorously probing candidate gaps.
</p>

[Live Audio Topology](#-real-time-audio--bidding-topology) • [The 3 AI Panelists](#-the-ai-panelist-board) • [Scorecard Philosophy](#-the-un-averaged-scorecard-philosophy) • [Benchmarks](#-latency--performance-benchmarks) • [Quickstart](#-instant-deployment-quickstart)

---

</div>

## ⚡ The Multi-Agent Floor Bidding Protocol

Instead of sequential turn-taking or messy cross-talk, Kyro Panel uses a **micro-auction bidding mechanism** over WebSockets:

```
[ Candidate Finishes Speaking ]
                │
                ▼ (Transcribed via Deepgram Nova-3 < 180ms)
       Centralized Shared Memory Model
  ┌─────────────┼─────────────┐
  ▼             ▼             ▼
[ Arjun ]   [ Ananya ]    [ Rohan ]
 (Arch)       (Product)    (Hiring)
  │             │             │
  ▼             ▼             ▼
Compute       Compute       Compute
Intent        Intent        Intent
Score         Score         Score
(e.g. 0.94)   (e.g. 0.62)   (e.g. 0.41)
  └─────────────┬─────────────┘
                │
                ▼
       Winner: Arjun (0.94)
       Takes RTC Floor Instantly
       Synthesizes audio via MiniMax TTS
       Streams into candidate's headphones in < 420ms
```

---

## 👥 The AI Panelist Board

Every interviewer has an isolated system prompt, evaluation criteria, and independent scoring rubrics:

| Panelist | Role | Focus Areas | What Triggers Their High Bid |
| :---: | :--- | :--- | :--- |
| ⚡ **Arjun** | **Principal Technical Architect** | System design, database trade-offs, concurrency, caching, failure recovery | Hand-waving technical depth, unaddressed edge cases, buzzword stuffing |
| 🎯 **Ananya** | **Director of Product Management** | User empathy, metric definition, product strategy, prioritization | Solutions looking for a problem, lack of business justification, zero KPI awareness |
| 👔 **Rohan** | **Executive Hiring Manager** | Culture fit, stakeholder diplomacy, crisis conflict resolution | Blaming past teammates, inability to explain "why this company", leadership red flags |

---

## 📊 The Un-Averaged Scorecard Philosophy

> **"When an interview panel disagrees, that disagreement is the single most valuable data point."**

Traditional automated systems average scores into meaningless mediocrity (e.g. *"Candidate scored 7.2/10"*). Kyro Panel delivers **three independent, transcript-cited verdicts**:

```
┌────────────────────────────────────────────────────────────────────────┐
│ 📋 ARJUN (ARCHITECT):  REJECT (3/10)                                   │
│ "Candidate proposed MongoDB for financial transaction ledger without   │
│ ACID double-entry accounting. Failed partition tolerance probe."       │
├────────────────────────────────────────────────────────────────────────┤
│ 📋 ANANYA (PRODUCT):    STRONG HIRE (9/10)                             │
│ "Superb user narrative. Identified customer friction in onboarding     │
│ and articulated a 3-phase phased rollout cleanly."                     │
├────────────────────────────────────────────────────────────────────────┤
│ 📋 ROHAN (HIRING LEAD): HIRE (7.5/10)                                  │
│ "Mature communication and candid about previous startup failure.       │
│ Receptive to feedback during the architectural pushback."              │
└────────────────────────────────────────────────────────────────────────┘
```

---

## ⚡ Latency & Performance Benchmarks

Measured over live Agora RTC WebRTC audio channels:

| Pipeline Stage | Processing Latency | Protocol / Model |
| :--- | :---: | :--- |
| **VAD (Voice Activity Detection)** | **60 ms** | Silero VAD Edge |
| **Speech-to-Text (ASR)** | **175 ms** | Deepgram Nova-3 Streaming WebSocket |
| **Tri-Agent Floor Auction** | **120 ms** | Concurrent Node.js Evaluation |
| **Response Generation (LLM)** | **280 ms** | Groq / Cerebras High-Throughput Inference |
| **Text-to-Speech (TTS)** | **140 ms** | MiniMax Real-Time Audio Streaming |
| **Glass-to-Glass Total** | **~775 ms** | **Sub-second human-conversational fluid pacing** |

---

## 🛠️ Architecture & Tech Stack

* **Audio Infrastructure**: Agora RTC 4.x Client SDK, WebRTC Opus Codec (48kHz stereo)
* **Speech Recognition**: Deepgram Nova-3 Streaming WebSocket with automatic punctuation
* **Voice Synthesis**: MiniMax High-Fidelity Audio API with streaming byte chunks
* **Frontend Cockpit**: React 19, Tailwind CSS v4, Lucide Icons, Framer Motion
* **Backend Services**: Node.js, Express, WebSocket bi-directional state bridge

---

## 🚀 Instant Deployment Quickstart

### Prerequisites
* Node.js v20+
* Agora App ID & App Certificate
* Deepgram API Key

### 1. Installation
```bash
git clone https://github.com/Anish974/kyro-panel.git
cd kyro-panel
npm install
```

### 2. Environment Configuration
Create a `.env` file in the root:
```env
PORT=5000
AGORA_APP_ID=your_agora_app_id
AGORA_APP_CERTIFICATE=your_agora_certificate
DEEPGRAM_API_KEY=your_deepgram_key
MINIMAX_API_KEY=your_minimax_key
```

### 3. Launch
```bash
# Terminal 1: Backend Server
npm start

# Terminal 2: Web Client
cd web && npm run dev
```

Visit `http://localhost:5173` to conduct a mock interview or schedule candidate evaluations.

---

<div align="center">

Developed by **[Anish](https://github.com/Anish974)** • Distributed under the **MIT License**

</div>
