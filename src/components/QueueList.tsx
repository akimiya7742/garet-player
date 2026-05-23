"use client";

import React from "react";
import { Play, Trash2, ListMusic } from "lucide-react";
import { useMusicWS } from "../contexts/MusicWSContext";
import styles from "./QueueList.module.css";

// Helper to format track durations (always formatted from milliseconds)
export const formatDuration = (val: number): string => {
  if (!val) return "0:00";
  const totalSeconds = Math.floor(val / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
};

export const QueueList: React.FC = () => {
  const { statistics, playNextTrack, removeTrack } = useMusicWS();
  const queue = statistics?.queue ?? [];

  return (
    <div className={`glass-panel ${styles.queueContainer}`}>
      <div className={styles.header}>
        <div className={styles.titleWrapper}>
          <ListMusic className={styles.headerIcon} />
          <h2 className={styles.title}>Play Queue</h2>
        </div>
        <span className={styles.counter}>{queue.length} track{queue.length !== 1 ? "s" : ""}</span>
      </div>

      <div className={styles.scrollArea}>
        {queue.length === 0 ? (
          <div className={styles.emptyState}>
            <p className={styles.emptyText}>Queue is empty</p>
            <p className={styles.emptySubtext}>Search and add tracks to get started!</p>
          </div>
        ) : (
          <div className={styles.list}>
            {queue.map((track, index) => (
              <div key={`${track.url}-${index}`} className={styles.item}>
                <span className={styles.index}>{index + 1}</span>
                
                {track.thumbnail && (
                  <img 
                    src={track.thumbnail} 
                    alt={track.title} 
                    className={styles.thumbnail}
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                )}

                <div className={styles.info}>
                  <p className={styles.trackTitle} title={track.title}>{track.title}</p>
                  <p className={styles.trackAuthor}>{track.author || "Unknown Author"}</p>
                </div>

                <span className={styles.duration}>{formatDuration(track.duration)}</span>

                <div className={styles.actions}>
                  <button
                    type="button"
                    onClick={() => playNextTrack(track.url, index)}
                    className={`${styles.actionBtn} ${styles.playBtn}`}
                    title="Play this track next"
                    aria-label={`Play ${track.title} next`}
                  >
                    <Play className={styles.btnIcon} />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeTrack(index)}
                    className={`${styles.actionBtn} ${styles.deleteBtn}`}
                    title="Remove from queue"
                    aria-label={`Remove ${track.title} from queue`}
                  >
                    <Trash2 className={styles.btnIcon} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
export default QueueList;
