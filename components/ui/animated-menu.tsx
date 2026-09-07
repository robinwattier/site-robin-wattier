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
  children: string;
  className?: string;
  center?: boolean;
}

/**
 * TextRoll component from 21st.dev (koustubhayadiyala36/animated-menu)
 * Staggers letter roll-up animation outward from the center on hover.
 */
export const TextRoll: React.FC<TextRollProps> = ({
  children,
  className,
  center = true,
}) => {
  return (
    <motion.span
      initial="initial"
      whileHover="hovered"
      className={cn("relative block overflow-hidden select-none cursor-pointer", className)}
      style={{
        lineHeight: 0.85,
      }}
    >
      {/* Top Text (Slides up) */}
      <div className="flex justify-center">
        {children.split("").map((l, i) => {
          const delay = center
            ? STAGGER * Math.abs(i - (children.length - 1) / 2)
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
      </div>

      {/* Bottom Text (Slides in from bottom) */}
      <div className="absolute inset-0 flex justify-center">
        {children.split("").map((l, i) => {
          const delay = center
            ? STAGGER * Math.abs(i - (children.length - 1) / 2)
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
      </div>
    </motion.span>
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
            {items.map((item, index) => (
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
                  onClick={(e) => {
                    onClose();
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
                  className="group relative flex flex-col items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C3E41D] rounded-xl px-6 py-2 transition-transform duration-200"
                  role="menuitem"
                >
                  {item.lines || item.name === "CONTACT / FOLLOW" ? (
                    <div className="flex flex-col items-center leading-[0.85]">
                      {(item.lines || ["CONTACT", "/ FOLLOW"]).map((line, lIdx) => (
                        <TextRoll
                          key={lIdx}
                          center
                          className={cn(
                            "text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold uppercase leading-[0.86] tracking-[-0.03em] transition-colors duration-200",
                            isDark
                              ? "text-white group-hover:text-[#C3E41D] group-focus-visible:text-[#C3E41D]"
                              : "text-[#0a0a0a] group-hover:text-[#C3E41D] group-focus-visible:text-[#C3E41D]"
                          )}
                        >
                          {line}
                        </TextRoll>
                      ))}
                    </div>
                  ) : (
                    <TextRoll
                      center
                      className={cn(
                        "text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold uppercase leading-[0.9] tracking-[-0.03em] transition-colors duration-200",
                        isDark
                          ? "text-white group-hover:text-[#C3E41D] group-focus-visible:text-[#C3E41D]"
                          : "text-[#0a0a0a] group-hover:text-[#C3E41D] group-focus-visible:text-[#C3E41D]"
                      )}
                    >
                      {item.name}
                    </TextRoll>
                  )}
                </motion.a>
              </motion.li>
            ))}
          </ul>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default AnimatedMenu;
