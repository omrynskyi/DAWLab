import React, { useEffect, useState } from "react";
import wordmark from "../assets/Dawlab-Text.png";
import "./SplashScreen.css";

interface SplashScreenProps {
  /** Called once the splash has fully faded out. */
  onFinish: () => void;
  /** How long the logo stays lit before fading, in ms. Default 1600. */
  duration?: number;
}

/**
 * Intro splash shown when the app opens: the white DAWLab wordmark lighting up
 * with a blue (#007bff) glow, then fading into the app.
 */
export const SplashScreen: React.FC<SplashScreenProps> = ({
  onFinish,
  duration = 1100,
}) => {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const fadeTimer = window.setTimeout(() => setLeaving(true), duration);
    const doneTimer = window.setTimeout(onFinish, duration + 600);
    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(doneTimer);
    };
  }, [duration, onFinish]);

  return (
    <div className={`splash-screen${leaving ? " splash-screen--leaving" : ""}`}>
      <img
        className="splash-screen__wordmark"
        src={wordmark}
        alt="DAWLab"
      />
    </div>
  );
};
