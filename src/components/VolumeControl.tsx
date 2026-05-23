"use client";

import React, { useState, useEffect } from "react";
import { Volume2, Volume1, VolumeX, Volume } from "lucide-react";
import { useMusicWS } from "../contexts/MusicWSContext";
import styles from "./VolumeControl.module.css";

export const VolumeControl: React.FC = () => {
  const { statistics, setVolume } = useMusicWS();
  const currentVolume = statistics?.volume ?? 50;
  
  const [localVol, setLocalVol] = useState(currentVolume);
  const [prevVol, setPrevVol] = useState(currentVolume);

  // Keep local volume in sync with remote stats
  useEffect(() => {
    setLocalVol(currentVolume);
  }, [currentVolume]);

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setLocalVol(val);
    setVolume(val);
  };

  const toggleMute = () => {
    if (localVol > 0) {
      setPrevVol(localVol);
      setLocalVol(0);
      setVolume(0);
    } else {
      const restoreVol = prevVol > 0 ? prevVol : 50;
      setLocalVol(restoreVol);
      setVolume(restoreVol);
    }
  };

  const renderIcon = () => {
    if (localVol === 0) return <VolumeX className={styles.icon} />;
    if (localVol < 30) return <Volume className={styles.icon} />;
    if (localVol < 70) return <Volume1 className={styles.icon} />;
    return <Volume2 className={styles.icon} />;
  };

  return (
    <div className={styles.volumeContainer}>
      <button 
        type="button"
        onClick={toggleMute} 
        className={styles.muteBtn}
        aria-label="Toggle mute"
      >
        {renderIcon()}
      </button>
      <div className={styles.sliderWrapper}>
        <input
          type="range"
          min="0"
          max="100"
          value={localVol}
          onChange={handleSliderChange}
          className={styles.volumeSlider}
          style={{
            background: `linear-gradient(to right, var(--accent-primary) 0%, var(--accent-primary) ${localVol}%, rgba(255, 255, 255, 0.1) ${localVol}%, rgba(255, 255, 255, 0.1) 100%)`
          }}
          aria-label="Volume level slider"
        />
        <span className={styles.volText}>{localVol}%</span>
      </div>
    </div>
  );
};
export default VolumeControl;
