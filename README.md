# Robin Wattier — Creative Portfolio

> **Designing human experiences in code.**  
> A cutting-edge, high-performance creative developer portfolio exploring AI, Audio, and Visual digital experiences.

---

## ✨ Features

- **🎯 Buttermax-Inspired Kinetic Custom Cursor**  
  Smooth spring physics, magnetic snap onto Project 1 on scroll, contextual hover labels, and dynamic cursor states.
- **🎞️ GSAP Cinematic Vault Zoom Slider**  
  Fluid horizontal scroll projection powered by GSAP, SplitText, and ScrollToPlugin with progressive titles.
- **⚡ Ultra-Fast Static Export (Zero Lag)**  
  Pure static pre-rendering (`output: "export"`) with optimized asset loading, WebP/JPEG assets, and no bloated base64 bundles.
- **🌗 Seamless Light & Dark Mode**  
  Custom color system with instant theme switching and tailored contrast for typography, cards, and navigation.
- **🚀 Dual Deployment Ready**  
  Runs out-of-the-box on both **GitHub Pages** (automated GitHub Actions workflow included) and **Vercel** (custom domains / root path).

---

## 🛠️ Tech Stack

- **Framework**: [Next.js 16](https://nextjs.org/) (App Router, Static Export)
- **UI Runtime**: [React 19](https://react.dev/) & [TypeScript](https://www.typescriptlang.org/)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/)
- **Animations & Physics**: [Framer Motion](https://www.framer.com/motion/) & [GSAP](https://gsap.com/)
- **Icons**: [Lucide React](https://lucide.dev/)
- **Typography**: KCY2KBanger-Bold, Fira Code, Montserrat

---

## 🚀 Getting Started Locally

Clone the repository and install dependencies:

```bash
git clone https://github.com/<your-username>/site-robin-wattier.git
cd site-robin-wattier
npm install
```

Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 📦 Production Build

To build the static export locally:

```bash
npm run build
```

The exported site will be generated in the `./out` directory.

---

## 🌐 Online Deployment

### Option A: GitHub Pages (Automated via GitHub Actions)
1. Push this repository to GitHub as a **Public** repository.
2. In your GitHub repository:
   - Go to **Settings** > **Pages**.
   - Under **Build and deployment** > **Source**, select **GitHub Actions**.
3. Push to `main` (or `master`) — the `.github/workflows/deploy.yml` workflow will automatically build and deploy your site to `https://<your-username>.github.io/<repo-name>/`!

### Option B: Vercel (1-Click)
1. Import your GitHub repository on [Vercel](https://vercel.com/new).
2. Framework preset will automatically detect Next.js.
3. Click **Deploy**. Vercel deploys directly at the root URL with edge CDN.

---

## 👤 Author

**Robin Wattier**  
- Portfolio: [Robin Wattier](https://github.com)
- Copyright © ROBIN WATTIER. All rights reserved.
