"use client";

import React, { useState, useEffect, useRef } from "react";
import { ChevronDown } from "lucide-react";
import { motion } from "framer-motion";
import BlurText from "@/components/ui/blur-text";
import { MenuToggleIcon } from "@/components/ui/menu-toggle-icon";
import Typewriter from "@/components/ui/typewriter";
import AnimatedMenu from "@/components/ui/animated-menu";
import Preloader from "@/components/ui/preloader";
import ButtermaxCursor from "@/components/ui/buttermax-cursor";
import { assetUrl } from "@/lib/utils";

export default function PortfolioHero() {
  const [isDark, setIsDark] = useState(true);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isScrolled, setIsScrolled] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const heroContentRef = useRef<HTMLElement>(null);

  // Track scroll position for glassmorphic navbar and progressive title exit
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
      if (heroContentRef.current) {
        const vh = window.innerHeight;
        const p = Math.max(0, Math.min(1, window.scrollY / (vh * 0.75)));
        heroContentRef.current.style.opacity = String((1 - p).toFixed(3));
        heroContentRef.current.style.transform = `translateY(${(-p * 45).toFixed(1)}px)`;
        const blur = p * 10;
        heroContentRef.current.style.filter = blur > 0.1 ? `blur(${blur.toFixed(1)}px)` : "none";
      }
    };
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Intro Splash Screen loader (1.2s introduction before FLIP morphing to header)
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 1200);
    return () => clearTimeout(timer);
  }, []);

  // Set dark mode by default
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  // Close menu on Escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isMenuOpen) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isMenuOpen]);

  // Lock body scroll when menu is open
  useEffect(() => {
    if (isMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isMenuOpen]);

  const toggleTheme = () => {
    const newTheme = !isDark;
    setIsDark(newTheme);
    if (newTheme) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  };

  const menuItems = [
    { label: "HOME", href: "#" },
    { label: "PROJECTS", href: "#projects" },
    {
      label: "CONTACT / FOLLOW",
      href: "https://linktr.ee/robinwattier",
      lines: ["CONTACT", "/ FOLLOW"],
    },
  ];

  return (
    <div
      className="min-h-screen transition-colors duration-300 snap-start"
      style={{
        backgroundColor: isDark ? "#000000" : "#fafafa",
        color: isDark ? "#ffffff" : "#0a0a0a",
      }}
    >
      {/* Buttermax Reactive Fluid Cursor */}
      <ButtermaxCursor isDark={isDark} />

      {/* Intro Preloader / Splash Screen with FLIP animation */}
      <Preloader isLoading={isLoading} />

      {/* ─── Header ───────────────────────────────────── */}
      <header
        className={`fixed top-0 left-0 right-0 z-50 px-6 sm:px-10 md:px-16 lg:px-20 transition-all duration-300 ease-out ${
          isScrolled
            ? "py-3 sm:py-4 border-b shadow-[0_8px_32px_rgba(0,0,0,0.25)]"
            : "py-5 sm:py-7 md:py-8 border-b border-transparent bg-transparent"
        }`}
        style={{
          backgroundColor: isScrolled
            ? isDark
              ? "rgba(0, 0, 0, 0.65)"
              : "rgba(255, 255, 255, 0.7)"
            : "transparent",
          borderColor: isScrolled
            ? isDark
              ? "rgba(255, 255, 255, 0.08)"
              : "rgba(0, 0, 0, 0.06)"
            : "transparent",
          backdropFilter: isScrolled ? "blur(16px)" : "none",
          WebkitBackdropFilter: isScrolled ? "blur(16px)" : "none",
        }}
      >
        {/* Delicate Grainy Noise Texture Overlay */}
        <div
          className={`pointer-events-none absolute inset-0 transition-opacity duration-500 ${
            isScrolled ? "opacity-35" : "opacity-0"
          }`}
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.12'/%3E%3C/svg%3E")`,
            backgroundRepeat: "repeat",
            mixBlendMode: isDark ? "screen" : "multiply",
          }}
          aria-hidden="true"
        />

        <nav
          className="relative z-10 flex items-center justify-between max-w-6xl mx-auto w-full"
          aria-label="Main navigation"
        >
          {/* Menu Button */}
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: isLoading ? 0 : 1, x: isLoading ? -10 : 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="relative z-10 flex items-center"
          >
            <motion.button
              ref={buttonRef}
              type="button"
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.92 }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
              className="w-11 h-11 sm:w-12 sm:h-12 flex items-center justify-center rounded-full transition-colors duration-300 cursor-pointer hover:bg-black/5 dark:hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C3E41D]"
              style={{ color: isDark ? "#ffffff" : "#0a0a0a" }}
              aria-label={isMenuOpen ? "Fermer le menu" : "Ouvrir le menu"}
              aria-expanded={isMenuOpen}
              onClick={() => setIsMenuOpen(!isMenuOpen)}
            >
              <MenuToggleIcon
                open={isMenuOpen}
                className="w-7 h-7 sm:w-8 sm:h-8"
                duration={400}
              />
            </motion.button>
          </motion.div>

          {/* Logo RW — Mathematically centered with shared FLIP layoutId */}
          {!isLoading && (
            <motion.a
              layoutId="rw-brand-logo"
              transition={{
                type: "spring",
                stiffness: 130,
                damping: 19,
                mass: 0.9,
              }}
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.94 }}
              href="#"
              onClick={(e) => {
                e.preventDefault();
                window.dispatchEvent(
                  new CustomEvent("rw-nav", { detail: { target: "home" } })
                );
              }}
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-xl sm:text-2xl font-bold select-none cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C3E41D] rounded-lg px-2 py-1 flex items-center justify-center font-logo tracking-wide"
              style={{
                color: isDark ? "#ffffff" : "#0a0a0a",
                fontFamily: "var(--font-banger), 'kcy2kBanger', 'KCY2KBanger-Bold', sans-serif",
              }}
              aria-label="Robin Wattier — RW"
            >
              RW
            </motion.a>
          )}

          {/* Theme Toggle */}
          <motion.div
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: isLoading ? 0 : 1, x: isLoading ? 10 : 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="z-10 flex items-center justify-end"
          >
            <motion.button
              type="button"
              onClick={toggleTheme}
              whileHover={{ scale: 1.06 }}
              whileTap={{ scale: 0.94 }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
              className="group relative flex items-center justify-center min-w-[44px] min-h-[44px] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C3E41D] rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
              aria-label={
                isDark ? "Passer en mode clair" : "Passer en mode sombre"
              }
            >
              <div
                className="relative w-11 h-6 rounded-full transition-all duration-300 p-0.5 border-[1.5px] flex items-center"
                style={{
                  backgroundColor: isDark
                    ? "rgba(255, 255, 255, 0.06)"
                    : "rgba(10, 10, 10, 0.04)",
                  borderColor: isDark ? "#ffffff" : "#0a0a0a",
                }}
              >
                <div
                  className="w-4 h-4 rounded-full transition-transform duration-300 flex items-center justify-center shadow-sm"
                  style={{
                    backgroundColor: isDark ? "#ffffff" : "#0a0a0a",
                    transform: isDark ? "translateX(20px)" : "translateX(0)",
                  }}
                />
              </div>
            </motion.button>
          </motion.div>
        </nav>
      </header>

      {/* ─── Animated Fullscreen Menu Overlay (21st.dev) ─── */}
      <AnimatedMenu
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        items={menuItems.map((item) => ({
          name: item.label,
          href: item.href,
          lines: item.lines,
        }))}
        isDark={isDark}
      />

      {/* ─── Hero Section ─────────────────────────────── */}
      <motion.main
        ref={heroContentRef}
        initial={{ opacity: 0 }}
        animate={{ opacity: isLoading ? 0 : 1 }}
        transition={{ duration: 0.7, delay: 0.25, ease: [0.16, 1, 0.3, 1] }}
        className="relative min-h-[100dvh] flex flex-col will-change-[opacity,transform,filter]"
      >
        {/* Centered Main Name */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full px-2 sm:px-4">
          <div className="relative text-center">
            <div>
              <BlurText
                text="ROBIN"
                delay={90}
                animateBy="letters"
                direction="top"
                trigger={!isLoading}
                className="font-bold text-[72px] xs:text-[90px] sm:text-[120px] md:text-[160px] lg:text-[200px] xl:text-[220px] leading-[0.75] tracking-tighter uppercase justify-center whitespace-nowrap"
                style={{
                  color: "#C3E41D",
                  fontFamily: "'Fira Code', monospace",
                }}
              />
            </div>
            <div>
              <BlurText
                text="WATTIER"
                delay={90}
                animateBy="letters"
                direction="top"
                trigger={!isLoading}
                className="font-bold text-[72px] xs:text-[90px] sm:text-[120px] md:text-[160px] lg:text-[200px] xl:text-[220px] leading-[0.75] tracking-tighter uppercase justify-center whitespace-nowrap"
                style={{
                  color: "#C3E41D",
                  fontFamily: "'Fira Code', monospace",
                }}
              />
            </div>

            {/* Profile Picture — Centered overlay with buttery spring hover */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
              {!isScrolled && (
                <motion.div
                  layoutId="profile-photo-avatar"
                  initial={{ scale: 0.7, opacity: 0 }}
                  animate={{
                    scale: isLoading ? 0.7 : 1,
                    opacity: isLoading ? 0 : 1,
                  }}
                  transition={{
                    type: "spring",
                    stiffness: 240,
                    damping: 22,
                    mass: 0.8,
                    delay: 0.15,
                  }}
                  whileHover={{ scale: 1.08 }}
                  whileTap={{ scale: 0.96 }}
                  className="w-[55px] h-[95px] xs:w-[65px] xs:h-[110px] sm:w-[85px] sm:h-[143px] md:w-[100px] md:h-[170px] lg:w-[120px] lg:h-[205px] xl:w-[135px] xl:h-[228px] rounded-full overflow-hidden shadow-2xl cursor-pointer select-none"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={assetUrl("/profil-1.jpeg")}
                    alt="Robin Wattier — Portrait"
                    className="w-full h-full object-cover pointer-events-none select-none"
                    loading="eager"
                  />
                </motion.div>
              )}
            </div>
          </div>
        </div>

        {/* Tagline / Typewriter Text */}
        <div className="absolute bottom-20 sm:bottom-24 md:bottom-28 lg:bottom-32 xl:bottom-36 left-1/2 -translate-x-1/2 w-full px-4 sm:px-6">
          <div className="flex justify-center">
            <Typewriter
              active={!isLoading}
              prefix={
                <>
                  <span className="font-bold">AI</span> and{" "}
                  <span className="font-bold">I</span> create:
                </>
              }
              phrases={["audiovisuals", "web design", "automation"]}
              className="text-sm sm:text-base md:text-lg lg:text-xl xl:text-[22px] text-center"
              prefixColor={isDark ? "#ffffff" : "#0a0a0a"}
              textColor={isDark ? "#ffffff" : "#0a0a0a"}
              cursorColor="#C3E41D"
              style={{
                fontFamily: "'Montserrat', sans-serif",
                fontOpticalSizing: "auto",
              }}
            />
          </div>
        </div>

        {/* Scroll Indicator with buttery spring physics */}
        <motion.button
          type="button"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: isLoading ? 0 : 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.45 }}
          whileHover={{ scale: 1.15, y: 3 }}
          whileTap={{ scale: 0.9 }}
          className="absolute bottom-6 sm:bottom-8 md:bottom-10 left-1/2 -translate-x-1/2 animate-bounce-slow transition-colors duration-300 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C3E41D] rounded-full p-1"
          style={{ color: isDark ? "#737373" : "#a3a3a3" }}
          aria-label="Défiler vers le bas"
          onClick={() => {
            window.dispatchEvent(
              new CustomEvent("rw-nav", { detail: { target: "projects" } })
            );
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = isDark ? "#ffffff" : "#0a0a0a";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = isDark ? "#737373" : "#a3a3a3";
          }}
        >
          <ChevronDown className="w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8 transition-colors duration-300" />
        </motion.button>
      </motion.main>

      {/* ─── Floating Chatbot Avatar (when scrolled) ─── */}
      {!isLoading && isScrolled && (
        <div className="fixed bottom-6 right-6 sm:bottom-8 sm:right-8 z-50 group">
          {/* Tooltip hint above avatar */}
          <div className="pointer-events-none absolute -top-10 right-0 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-1 group-hover:translate-y-0 whitespace-nowrap px-3 py-1 rounded-full text-xs font-semibold tracking-wide shadow-xl bg-black/85 text-white border border-white/15 backdrop-blur-md flex items-center gap-1.5 z-10">
            <span className="w-1.5 h-1.5 rounded-full bg-[#C3E41D]" />
            <span>Chat with Robin</span>
          </div>

          <motion.div
            layoutId="profile-photo-avatar"
            whileHover={{ scale: 1.1, y: -2 }}
            whileTap={{ scale: 0.94 }}
            transition={{
              type: "spring",
              stiffness: 260,
              damping: 24,
              mass: 0.8,
            }}
            className="w-14 h-14 sm:w-16 sm:h-16 rounded-full overflow-hidden cursor-pointer select-none relative"
            style={{
              boxShadow: isDark
                ? "0 10px 35px rgba(0, 0, 0, 0.7), 0 0 20px rgba(195, 228, 29, 0.25)"
                : "0 10px 30px rgba(0, 0, 0, 0.25)",
              border: isDark
                ? "2px solid #C3E41D"
                : "2px solid #0a0a0a",
            }}
            role="button"
            tabIndex={0}
            aria-label="Assistant de Robin Wattier"
            onClick={() => {
              // Futur chat bot - sera configuré plus tard
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={assetUrl("/profil-1.jpeg")}
              alt="Robin Wattier — Assistant"
              className="w-full h-full object-cover pointer-events-none select-none"
              loading="eager"
            />
          </motion.div>

          {/* Glowing Online Status Indicator Dot */}
          <span className="pointer-events-none absolute bottom-0 right-0 flex h-3.5 w-3.5 sm:h-4 sm:w-4 z-10">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#C3E41D] opacity-75" />
            <span
              className="relative inline-flex rounded-full h-3.5 w-3.5 sm:h-4 sm:w-4 bg-[#C3E41D] border-2"
              style={{ borderColor: isDark ? "#000000" : "#ffffff" }}
            />
          </span>
        </div>
      )}
    </div>
  );
}
