# MediMind AI - Setup Guide

## Prerequisites

- Node.js 18+
- npm or yarn
- Git
- VS Code (recommended)

## Installation

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env` and add your API keys.

### 3. Run Development Server

```bash
npm run dev
```

Open http://localhost:3000

## Troubleshooting

Clear cache if you encounter errors:

```bash
Remove-Item -Recurse -Force node_modules, package-lock.json
npm install
```

## Deployment

```bash
npm run build
npx vercel --prod
```
