"use client";

import React, { useState, useEffect, useRef } from "react";
import { 
  Play, Pause, SkipForward, SkipBack, Repeat, Shuffle, 
  Lock, Unlock, Radio, Users
} from "lucide-react";
import { useMusicWS } from "../contexts/MusicWSContext";
import { formatDuration } from "./QueueList";
import VolumeControl from "./VolumeControl";
import styles from "./PlayerControls.module.css";

export const PlayerControls: React.FC = () => {
  const {
    statistics,
    voiceConnection,
    togglePlay,
    skipTrack,
    playPrevious,
    cycleLoop,
    shuffleQueue,
    seekPosition,
    toggleLock,
    toggleAutoPlay,
  } = useMusicWS();

  const track = statistics?.track;
  const isPlaying = track && !statistics?.paused;
  const totalDuration = track?.duration ?? 0;
  const currentTimestamp = statistics?.timestamp ?? 0;

  // Local state for smooth timeline updates between 1s WebSocket heartbeats
  const [localTime, setLocalTime] = useState(currentTimestamp);
  const [isDragging, setIsDragging] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Synchronize local time when the WS statistics update
  useEffect(() => {
    if (!isDragging) {
      setLocalTime(currentTimestamp);
    }
  }, [currentTimestamp, isDragging]);

  // Tick local time forward when music is actively playing
  useEffect(() => {
    if (isPlaying && !isDragging) {
      const tick = 100; // Increment every 100ms
      intervalRef.current = setInterval(() => {
        setLocalTime((prev) => {
          if (totalDuration > 0 && prev >= totalDuration) {
            clearInterval(intervalRef.current!);
            return totalDuration;
          }
          return prev + tick;
        });
      }, tick);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isPlaying, isDragging, totalDuration]);

  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsDragging(true);
    setLocalTime(Number(e.target.value));
  };

  const handleSeekEnd = () => {
    setIsDragging(false);
    seekPosition(localTime);
  };

  // Formulate active percentage for CSS background slider track
  const progressPercent = totalDuration > 0 ? (localTime / totalDuration) * 100 : 0;

  return (
    <div className={`content-surface ${styles.playerConsole}`}>
      {/* Dynamic Ambient Background Cover */}
      <div 
        className={styles.ambientCover} 
        style={{ backgroundImage: `url(${track?.thumbnail || "https://images.unsplash.com/photo-1614680376593-902f74fa0d41?w=500"})` }} 
      />

      <div className={styles.topSection}>
        {/* Track Title and Artist details */}
        <div className={`${styles.trackDetails} ${styles.desktopTrackDetails}`}>
          {track ? (
            <>
              <h1 className={styles.title} title={track.title}>{track.title}</h1>
              <p className={styles.artist}>{track.author || "Discord Bot Player"}</p>
            </>
          ) : (
            <>
              <h1 className={styles.title}>Not Playing</h1>
              <p className={styles.artist}>No active track in voice connection</p>
            </>
          )}
        </div>

        {/* Listeners & Guild tags */}
        {voiceConnection && (
          <div className={styles.voiceDetails}>
            <div className={styles.badge} title="Active Discord voice channel">
              <Radio className={styles.badgeIcon} />
              <span>{voiceConnection.guild.name} • {voiceConnection.channel.name}</span>
            </div>
            {statistics && (
              <div className={styles.badge} title="Active listeners in channel">
                <Users className={styles.badgeIcon} />
                <span>{statistics.listeners} listening</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Square album artwork */}
      <div className={styles.artworkSection}>
        <div className={styles.squareArtworkWrapper}>
          <img 
            src={track?.thumbnail || "https://images.unsplash.com/photo-1614680376593-902f74fa0d41?w=500"} 
            alt={track?.title || "No track artwork"}
            className={styles.artworkImage}
          />
        </div>
        <div className={styles.mobileTrackDetails}>
          {track ? (
            <>
              <h1 className={styles.title} title={track.title}>{track.title}</h1>
              <p className={styles.artist}>{track.author || "Discord Bot Player"}</p>
            </>
          ) : (
            <>
              <h1 className={styles.title}>Not Playing</h1>
              <p className={styles.artist}>No active track in voice connection</p>
            </>
          )}
        </div>
      </div>

      {/* Progress Timeline Slider */}
      <div className={styles.timelineSection}>
        <div className={styles.timeInfo}>
          <span>{formatDuration(localTime)}</span>
          <span>{formatDuration(totalDuration)}</span>
        </div>
        <input
          type="range"
          min="0"
          max={totalDuration}
          value={localTime}
          onChange={handleSeekChange}
          onMouseUp={handleSeekEnd}
          onTouchEnd={handleSeekEnd}
          className={styles.timelineSlider}
          style={{
            background: `linear-gradient(to right, var(--accent-primary) 0%, var(--accent-primary) ${progressPercent}%, rgba(255, 255, 255, 0.1) ${progressPercent}%, rgba(255, 255, 255, 0.1) 100%)`
          }}
          disabled={!track}
          aria-label="Track playback progress slider"
        />
      </div>

      {/* Controls Bar */}
      <div className={styles.controlsSection}>
        <div className={styles.leftControls}>
          {/* Lock status toggler */}
          <button
            type="button"
            onClick={toggleLock}
            className={`${styles.iconBtn} ${statistics?.lockStatus ? styles.activeLock : ""}`}
            title={statistics?.lockStatus ? "Unlock player (Restricted to requester)" : "Lock player (Restrict to requester)"}
            disabled={!track}
            aria-label={statistics?.lockStatus ? "Unlock player" : "Lock player"}
          >
            {statistics?.lockStatus ? <Lock className={styles.controlIcon} /> : <Unlock className={styles.controlIcon} />}
          </button>
          
          {/* Autoplay toggler */}
          <button
            type="button"
            onClick={toggleAutoPlay}
            className={`${styles.iconBtn} ${statistics?.autoPlay ? styles.activeBtn : ""}`}
            title="Toggle autoplay"
            disabled={!track}
            aria-label="Toggle autoplay"
          >
            <Radio className={styles.controlIcon} />
          </button>
        </div>

        <div className={styles.centerControls}>
          <button
            type="button"
            onClick={playPrevious}
            className={styles.mediaBtn}
            disabled={!track}
            title="Previous track"
            aria-label="Previous track"
          >
            <SkipBack className={styles.mediaIcon} />
          </button>

          <button
            type="button"
            onClick={togglePlay}
            className={`${styles.mediaBtn} ${styles.playPauseBtn}`}
            disabled={!track}
            title={isPlaying ? "Pause" : "Play"}
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? (
              <Pause className={styles.playPauseIcon} />
            ) : (
              <Play className={`${styles.playPauseIcon} ${styles.playIconFix}`} />
            )}
          </button>

          <button
            type="button"
            onClick={skipTrack}
            className={styles.mediaBtn}
            disabled={!track}
            title="Skip track"
            aria-label="Skip track"
          >
            <SkipForward className={styles.mediaIcon} />
          </button>
        </div>

        <div className={styles.rightControls}>
          {/* Loop controls */}
          <button
            type="button"
            onClick={cycleLoop}
            className={`${styles.iconBtn} ${statistics?.repeatMode !== "off" ? styles.activeBtn : ""}`}
            title={`Repeat mode: ${statistics?.repeatMode || "off"}`}
            disabled={!track}
            aria-label={`Cycle repeat mode. Current: ${statistics?.repeatMode || "off"}`}
          >
            <Repeat className={styles.controlIcon} />
            {statistics?.repeatMode === "track" && <span className={styles.repeatBadge}>1</span>}
            {statistics?.repeatMode === "queue" && <span className={styles.repeatBadge}>Q</span>}
          </button>

          {/* Shuffle controls */}
          <button
            type="button"
            onClick={shuffleQueue}
            className={styles.iconBtn}
            title="Shuffle queue"
            disabled={!track}
            aria-label="Shuffle queue"
          >
            <Shuffle className={styles.controlIcon} />
          </button>
        </div>
      </div>

      {/* Embedded Volume Level */}
      <div className={styles.bottomSection}>
        <div className={styles.volumeWrapper}>
          <VolumeControl />
        </div>
      </div>
    </div>
  );
};
export default PlayerControls;
