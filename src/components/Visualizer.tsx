"use client";

import React from "react";
import styles from "./Visualizer.module.css";

interface VisualizerProps {
  isPlaying: boolean;
}

export const Visualizer: React.FC<VisualizerProps> = ({ isPlaying }) => {
  return (
    <div className={styles.visualizerContainer}>
      <div className={`${styles.bar} ${isPlaying ? styles.active : ""} ${styles.bar1}`} />
      <div className={`${styles.bar} ${isPlaying ? styles.active : ""} ${styles.bar2}`} />
      <div className={`${styles.bar} ${isPlaying ? styles.active : ""} ${styles.bar3}`} />
      <div className={`${styles.bar} ${isPlaying ? styles.active : ""} ${styles.bar4}`} />
      <div className={`${styles.bar} ${isPlaying ? styles.active : ""} ${styles.bar5}`} />
    </div>
  );
};
export default Visualizer;
