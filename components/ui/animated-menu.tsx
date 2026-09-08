"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

const STAGGER = 0.035;

export interface MenuItem {
  name: string;
  href: string;
  description?: string;
  highlight?: boolean;
  lines?: string[];
}

interface TextRollProps {
  children?: string;
  lines?: string[];
  className?: string;
  center?: boolean;
}

/**
 * TextRoll component from 21st.dev (koustubhayadiyala36/animated-menu)
 * Staggers letter roll-up animation outward from the center on hover.
 * Supports multi-line layout with unified synchronization.
 */
export const TextRoll: React.FC<TextRollProps> = ({
  children,
  lines,
  className,
  center = true,
}) => {
  const lineArray = lines && lines.length > 0 ? lines : children ? [children] : [];

  return (
    <span
      className={cn(
        "relative block select-none pointer-events-none",
        lineArray.length > 1 ? "flex flex-col items-start leading-[0.84]" : "",
        className
      )}
      style={{
        lineHeight: 0.86,
      }}
    >
      {lineArray.map((lineText, lineIdx) => (
        <span
          key={lineIdx}
          className="relative block overflow-hidden"
          style={{ lineHeight: 0.86 }}
        >
          {/* Top Text (Slides up) */}
          <span className="flex justify-start">
            {lineText.split("").map((l, i) => {
              const delay = center
                ? STAGGER * Math.abs(i - (lineText.length - 1) / 2)
                : STAGGER * i;

              return (
                <motion.span
                  variants={{
                    initial: {
                      y: 0,
                    },
                    hovered: {
                      y: "-100%",
                    },
                  }}
                  transition={{
                    ease: "easeInOut",
                    delay,
                  }}
                  className="inline-block"
                  key={i}
                >
                  {l === " " ? "\u00A0" : l}
                </motion.span>
              );
            })}
          </span>

          {/* Bottom Text (Slides in from bottom) */}
          <span className="absolute inset-0 flex justify-start">
            {lineText.split("").map((l, i) => {
              const delay = center
                ? STAGGER * Math.abs(i - (lineText.length - 1) / 2)
                : STAGGER * i;

              return (
                <motion.span
                  variants={{
                    initial: {
                      y: "100%",
                    },
                    hovered: {
                      y: 0,
                    },
                  }}
                  transition={{
                    ease: "easeInOut",
                    delay,
                  }}
                  className="inline-block"
                  key={i}
                >
                  {l === " " ? "\u00A0" : l}
                </motion.span>
              );
            })}
          </span>
        </span>
      ))}
    </span>
  );
};

interface AnimatedMenuProps {
  isOpen: boolean;
  onClose: () => void;
  items: MenuItem[];
  isDark?: boolean;
}

export const AnimatedMenu: React.FC<AnimatedMenuProps> = ({
  isOpen,
  onClose,
  items,
  isDark = true,
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25, ease: "easeInOut" }}
          className="fixed inset-0 z-40 flex flex-col items-center justify-center backdrop-blur-xl"
          style={{
            backgroundColor: isDark
              ? "rgba(0, 0, 0, 0.95)"
              : "rgba(250, 250, 250, 0.95)",
            fontFamily: "'Montserrat', sans-serif",
          }}
          onClick={(e) => {
            const target = e.target as HTMLElement;
            // Close if clicking anywhere in the void / empty space (outside interactive links)
            if (!target.closest("a")) {
              onClose();
            }
          }}
        >
          <ul
            className="flex min-h-full w-full flex-1 flex-col items-center justify-center gap-5 sm:gap-7 md:gap-9 px-6 py-16"
            role="menu"
            aria-label="Navigation principale"
          >
            {items.map((item, index) => {
              const isExternal = item.href.startsWith("http");

              return (
                <motion.li
                  key={item.name}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  transition={{
                    duration: 0.25,
                    delay: index * 0.04 + 0.05,
                    ease: "easeOut",
                  }}
                  className="relative flex cursor-pointer flex-col items-center overflow-visible"
                  role="none"
                >
                  <motion.a
                    initial="initial"
                    whileHover="hovered"
                    whileTap={{ scale: 0.95 }}
                    href={item.href}
                    target={isExternal ? "_blank" : undefined}
                    rel={isExternal ? "noopener noreferrer" : undefined}
                    onClick={(e) => {
                      onClose();
                      if (isExternal) {
                        return;
                      }
                      e.preventDefault();
                      if (item.href === "#" || item.href === "#home") {
                        window.dispatchEvent(
                          new CustomEvent("rw-nav", { detail: { target: "home" } })
                        );
                      } else if (item.href === "#projects") {
                        window.dispatchEvent(
                          new CustomEvent("rw-nav", { detail: { target: "projects" } })
                        );
                      } else if (item.href === "#contact") {
                        window.dispatchEvent(
                          new CustomEvent("rw-nav", { detail: { target: "contact" } })
                        );
                      }
                    }}
                    className="group relative flex flex-col items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C3E41D] rounded-xl px-4 sm:px-6 py-2 transition-transform duration-200"
                    role="menuitem"
                  >
                    <TextRoll
                      lines={item.lines}
                      center
                      className={cn(
                        "text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold uppercase tracking-[-0.03em] transition-colors duration-200",
                        isDark
                          ? "text-white group-hover:text-[#C3E41D] group-focus-visible:text-[#C3E41D]"
                          : "text-[#0a0a0a] group-hover:text-[#C3E41D] group-focus-visible:text-[#C3E41D]"
                      )}
                    >
                      {item.name}
                    </TextRoll>
                  </motion.a>
                </motion.li>
              );
            })}
          </ul>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default AnimatedMenu;
