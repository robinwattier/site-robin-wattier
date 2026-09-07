"use client";

import React, { useState, useEffect } from "react";

interface TypewriterProps {
  prefix?: React.ReactNode;
  phrases?: string[];
  typingSpeed?: number;
  deletingSpeed?: number;
  pauseDuration?: number;
  className?: string;
  prefixColor?: string;
  textColor?: string;
  cursorColor?: string;
  phraseClassName?: string;
  style?: React.CSSProperties;
}

export const Typewriter: React.FC<TypewriterProps> = ({
  prefix = (
    <>
      <span className="font-bold">AI</span> and{" "}
      <span className="font-bold">I</span> create:
    </>
  ),
  phrases = ["audiovisuals", "web design", "automation"],
  typingSpeed = 90,
  deletingSpeed = 45,
  pauseDuration = 1600,
  className = "",
  prefixColor,
  textColor,
  cursorColor,
  phraseClassName,
  style,
}) => {
  const [currentPhraseIndex, setCurrentPhraseIndex] = useState(0);
  const [displayedText, setDisplayedText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!phrases || phrases.length === 0) return;

    const fullText = phrases[currentPhraseIndex];
    let timer: NodeJS.Timeout;

    if (!isDeleting) {
      // Typing phase
      if (displayedText.length < fullText.length) {
        timer = setTimeout(() => {
          setDisplayedText(fullText.slice(0, displayedText.length + 1));
        }, typingSpeed);
      } else {
        // Pause at the end of typing
        timer = setTimeout(() => {
          setIsDeleting(true);
        }, pauseDuration);
      }
    } else {
      // Deleting phase
      if (displayedText.length > 0) {
        timer = setTimeout(() => {
          setDisplayedText(fullText.slice(0, displayedText.length - 1));
        }, deletingSpeed);
      } else {
        // Pause before typing next phrase
        timer = setTimeout(() => {
          setIsDeleting(false);
          setCurrentPhraseIndex((prev) => (prev + 1) % phrases.length);
        }, 300);
      }
    }

    return () => clearTimeout(timer);
  }, [displayedText, isDeleting, currentPhraseIndex, phrases, typingSpeed, deletingSpeed, pauseDuration]);

  const renderPrefix = () => {
    if (typeof prefix === "string" && prefix === "AI and I create:") {
      return (
        <>
          <span className="font-bold">AI</span> and{" "}
          <span className="font-bold">I</span> create:
        </>
      );
    }
    return prefix;
  };

  return (
    <div
      className={`inline-flex items-center justify-center flex-wrap gap-x-2 text-center select-none ${className}`}
      style={style}
      aria-label={`AI and I create: ${phrases[currentPhraseIndex] || ""}`}
    >
      {prefix && (
        <span
          className="font-normal transition-colors duration-300"
          style={{ color: prefixColor }}
        >
          &quot;{renderPrefix()}
        </span>
      )}

      <span className="inline-flex items-center">
        <span
          className={`font-bold transition-colors duration-300 ${phraseClassName || ""}`}
          style={{ color: textColor }}
        >
          {displayedText}
        </span>

        {/* Blinking Typewriter Cursor */}
        <span
          className="inline-block w-[2px] h-[1.15em] ml-0.5 align-middle animate-cursor-blink"
          style={{ backgroundColor: cursorColor || textColor || "#C3E41D" }}
          aria-hidden="true"
        />

        <span
          className="font-normal transition-colors duration-300 ml-0.5"
          style={{ color: prefixColor || textColor }}
        >
          &quot;
        </span>
      </span>
    </div>
  );
};

export default Typewriter;
