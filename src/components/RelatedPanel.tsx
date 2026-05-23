"use client";

import React from "react";
import { Play, Music2, Sparkles } from "lucide-react";
import { useMusicWS } from "../contexts/MusicWSContext";
import { formatDuration } from "./QueueList";
import styles from "./RelatedPanel.module.css";

export const RelatedPanel: React.FC = () => {
  const { statistics, playTrack } = useMusicWS();
  const related = statistics?.related ?? [];

  return (
    <div className={`glass-panel ${styles.relatedContainer}`}>
      <div className={styles.header}>
        <div className={styles.titleWrapper}>
          <Sparkles className={styles.headerIcon} />
          <h2 className={styles.title}>Up Next / Related</h2>
        </div>
        <span className={styles.counter}>
          {related.length} suggestion{related.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className={styles.scrollArea}>
        {related.length === 0 ? (
          <div className={styles.emptyState}>
            <Music2 className={styles.emptyIcon} />
            <p className={styles.emptyText}>No suggestions yet</p>
            <p className={styles.emptySubtext}>
              Related tracks will appear here as the bot discovers them.
            </p>
          </div>
        ) : (
          <div className={styles.list}>
            {related.map((track, index) => (
              <div key={`${track.url}-${index}`} className={styles.item}>
                {/* Rank badge */}
                <span className={styles.index}>{index + 1}</span>

                {/* Thumbnail or fallback */}
                {track.thumbnail ? (
                  <img
                    src={track.thumbnail}
                    alt={track.title}
                    className={styles.thumbnail}
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                ) : (
                  <div className={styles.thumbnailFallback}>
                    <Music2 className={styles.fallbackIcon} />
                  </div>
                )}

                {/* Track info */}
                <div className={styles.info}>
                  <p className={styles.trackTitle} title={track.title}>
                    {track.title}
                  </p>
                  <p className={styles.trackAuthor}>
                    {track.author || "Unknown Artist"}
                  </p>
                </div>

                <span className={styles.duration}>
                  {formatDuration(track.duration)}
                </span>

                {/* Play action */}
                <button
                  type="button"
                  onClick={() => playTrack(track.url)}
                  className={styles.playBtn}
                  title={`Play ${track.title}`}
                  aria-label={`Play ${track.title}`}
                >
                  <Play className={styles.playIcon} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default RelatedPanel;
