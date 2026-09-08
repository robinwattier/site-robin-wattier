"use client";

import React, { useEffect, useRef } from "react";
import { motion } from "framer-motion";

interface ContactSectionProps {
  title?: string;
  className?: string;
}

const LINE1_LETTERS = ["C", "O", "N", "T", "A", "C", "T"];
const LINE2_LETTERS = ["/", "F", "O", "L", "L", "O", "W"];
const ALL_LETTERS = [...LINE1_LETTERS, ...LINE2_LETTERS];

export default function ContactSection({
  title = "CONTACT / FOLLOW",
  className = "",
}: ContactSectionProps) {
  const containerRef = useRef<HTMLElement | null>(null);
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const letterRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const footerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const updateTitleProgress = () => {
      if (!containerRef.current || typeof window === "undefined") return;

      const rect = containerRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight;

      // When user is in Projects: rect.top = viewportHeight -> progress = 0.
      // When Contact fills the screen: rect.top <= 0 -> progress = 1.
      const rawProgress = (viewportHeight - rect.top) / viewportHeight;
      const progress = Math.max(0, Math.min(1, rawProgress));

      // 1. Progressive letter-by-letter reveal for CONTACT on Line 1, then / FOLLOW on Line 2
      ALL_LETTERS.forEach((_, i) => {
        const el = letterRefs.current[i];
        if (!el) return;

        // Entrance window staggered across 14 characters:
        const start = 0.05 + i * 0.055;
        const range = 0.18;
        const p = Math.max(0, Math.min(1, (progress - start) / range));
        const yOffset = (1 - p) * 36;
        const blur = (1 - p) * 12;
        const scale = 0.92 + p * 0.08;

        el.style.opacity = String(p.toFixed(3));
        el.style.transform = `translateY(${yOffset.toFixed(1)}px) scale(${scale.toFixed(3)})`;
        el.style.filter = blur > 0.1 ? `blur(${blur.toFixed(1)}px)` : "none";
      });

      // 2. Center Linktree card reveal: floats and unblurs smoothly in sync with scroll
      if (cardRef.current) {
        const pCard = Math.max(0, Math.min(1, (progress - 0.35) / 0.55));
        const cardY = (1 - pCard) * 28;
        const cardBlur = (1 - pCard) * 10;
        const cardScale = 0.88 + pCard * 0.12;

        cardRef.current.style.opacity = String(pCard.toFixed(3));
        cardRef.current.style.transform = `scale(${cardScale.toFixed(3)}) translateY(${cardY.toFixed(1)}px)`;
        cardRef.current.style.filter = cardBlur > 0.1 ? `blur(${cardBlur.toFixed(1)}px)` : "none";
      }

      // 3. Bottom Footer Copyright reveal
      if (footerRef.current) {
        const pFooter = Math.max(0, Math.min(1, (progress - 0.45) / 0.45));
        const footerY = (1 - pFooter) * 16;
        const footerBlur = (1 - pFooter) * 6;

        footerRef.current.style.opacity = String(pFooter.toFixed(3));
        footerRef.current.style.transform = `translateY(${footerY.toFixed(1)}px)`;
        footerRef.current.style.filter = footerBlur > 0.1 ? `blur(${footerBlur.toFixed(1)}px)` : "none";
      }
    };

    updateTitleProgress();
    window.addEventListener("scroll", updateTitleProgress, { passive: true });
    window.addEventListener("resize", updateTitleProgress);

    return () => {
      window.removeEventListener("scroll", updateTitleProgress);
      window.removeEventListener("resize", updateTitleProgress);
    };
  }, []);

  return (
    <section
      ref={containerRef}
      id="contact"
      className={`relative w-full overflow-hidden transition-colors duration-300 bg-[#fafafa] dark:bg-black text-[#0a0a0a] dark:text-white ${className}`}
      style={{ height: "100svh" }}
      aria-label="Contact / Follow Section"
    >
      {/* Top-left Section Title - progressive letter-by-letter kinetic unblur */}
      <div className="pointer-events-none absolute left-6 sm:left-10 md:left-16 lg:left-20 top-24 sm:top-28 md:top-32 lg:top-36 z-20 text-left">
        <h2
          ref={titleRef}
          aria-label={title}
          className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-black uppercase tracking-tight text-[#0a0a0a] dark:text-white leading-[0.85] select-none transition-colors duration-300"
        >
          {/* Line 1: CONTACT */}
          <span className="block overflow-visible whitespace-nowrap">
            {LINE1_LETTERS.map((char, i) => (
              <span
                key={i}
                ref={(el) => {
                  letterRefs.current[i] = el;
                }}
                aria-hidden="true"
                className="inline-block will-change-[opacity,transform,filter]"
                style={{
                  opacity: 0,
                  transform: "translateY(36px) scale(0.92)",
                  filter: "blur(12px)",
                  display: "inline-block",
                }}
              >
                {char}
              </span>
            ))}
          </span>

          {/* Line 2: / FOLLOW */}
          <span className="block overflow-visible whitespace-nowrap mt-1 sm:mt-2">
            {LINE2_LETTERS.map((char, i) => {
              const letterIndex = LINE1_LETTERS.length + i;
              const isSlash = char === "/";
              return (
                <span
                  key={letterIndex}
                  ref={(el) => {
                    letterRefs.current[letterIndex] = el;
                  }}
                  aria-hidden="true"
                  className={`inline-block will-change-[opacity,transform,filter] ${
                    isSlash ? "mr-1.5 sm:mr-2" : ""
                  }`}
                  style={{
                    opacity: 0,
                    transform: "translateY(36px) scale(0.92)",
                    filter: "blur(12px)",
                    display: "inline-block",
                  }}
                >
                  {char}
                </span>
              );
            })}
          </span>
        </h2>
      </div>

      {/* Center Linktree SVG Logo with dynamic theme adaptation and hover effect */}
      <div
        ref={cardRef}
        className="absolute inset-0 flex items-center justify-center p-6 will-change-[opacity,transform,filter]"
        style={{
          opacity: 0,
          transform: "scale(0.88) translateY(28px)",
          filter: "blur(10px)",
        }}
      >
        <motion.a
          href="https://linktr.ee/robinwattier"
          target="_blank"
          rel="noopener noreferrer"
          whileHover={{ scale: 1.12, y: -4 }}
          whileTap={{ scale: 0.94 }}
          transition={{
            type: "spring",
            stiffness: 320,
            damping: 20,
          }}
          className="group relative flex flex-col items-center justify-center p-5 sm:p-6 rounded-2xl sm:rounded-3xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C3E41D] cursor-pointer"
          aria-label="Robin Wattier — Linktree (https://linktr.ee/robinwattier)"
        >
          {/* SVG Logo: adapts dynamically across themes exactly like the 'RW' logo */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 640 640"
            className="w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 lg:w-28 lg:h-28 fill-current text-[#0a0a0a] dark:text-white transition-colors duration-300 pointer-events-none select-none drop-shadow-sm"
            aria-hidden="true"
          >
            <path d="M112 237.4L237.8 237.4L148.4 152L197.9 101L283.1 188.8L283.1 64L357 64L357 188.8L442.2 101.2L491.6 152L402.2 237.2L527.9 237.2L527.9 307.7L401.5 307.7L491.5 395.3L442.2 445.1L320 322.1L197.8 445.1L148.3 395.5L238.3 307.9L111.9 307.9L111.9 237.4zM282.9 408.8L356.8 408.8L356.8 576L282.9 576L282.9 408.8z" />
          </svg>
        </motion.a>
      </div>

      {/* Bottom Footer Copyright */}
      <footer
        ref={footerRef}
        className="pointer-events-none absolute bottom-6 sm:bottom-8 md:bottom-10 left-0 right-0 z-20 flex items-center justify-center px-6 select-none will-change-[opacity,transform,filter]"
        style={{
          opacity: 0,
          transform: "translateY(16px)",
          filter: "blur(6px)",
        }}
      >
        <p className="text-[11px] sm:text-xs tracking-[0.18em] uppercase font-medium text-neutral-500 dark:text-neutral-400 transition-colors duration-300">
          © Robin Wattier
        </p>
      </footer>
    </section>
  );
}
